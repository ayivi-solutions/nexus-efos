// doc §35 Customer Merge and Duplicate Management. §35.4 "Merged records
// preserve transaction history" — this is the actual, real reassignment
// across every model that references a customer, run inside a single
// database transaction so it's genuinely atomic: if any one reassignment
// fails (e.g. a unique-constraint conflict on AccountHolder), the whole
// merge fails cleanly and nothing is left half-merged, rather than
// silently succeeding on 9 of 10 models.
export const CUSTOMER_REFERENCING_MODELS = [
  "nextOfKin", "customerNote", "beneficiary", "beneficialOwner",
  "loan", "savingsAccount", "accountHolder", "document",
  "collectionRouteCustomer", "collectionTransaction",
] as const;

export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  nextOfKin: "NextOfKin", customerNote: "CustomerNote", beneficiary: "Beneficiary", beneficialOwner: "BeneficialOwner",
  loan: "Loan", savingsAccount: "SavingsAccount", accountHolder: "AccountHolder", document: "Document",
  collectionRouteCustomer: "CollectionRouteCustomer", collectionTransaction: "CollectionTransaction",
};

export interface ReassignedRecord { model: string; id: string }

// tx is a Prisma transaction client (from prisma.$transaction(async (tx) => ...)).
export async function executeCustomerMerge(tx: any, primaryCustomerId: string, mergedCustomerId: string): Promise<ReassignedRecord[]> {
  const reassigned: ReassignedRecord[] = [];

  for (const modelKey of CUSTOMER_REFERENCING_MODELS) {
    const records = await tx[modelKey].findMany({ where: { customerId: mergedCustomerId }, select: { id: true } });
    for (const r of records) reassigned.push({ model: modelKey, id: r.id });
    if (records.length > 0) {
      await tx[modelKey].updateMany({ where: { customerId: mergedCustomerId }, data: { customerId: primaryCustomerId } });
    }
  }

  await tx.customer.update({ where: { id: mergedCustomerId }, data: { mergeStatus: "MERGED", mergedIntoCustomerId: primaryCustomerId } });

  return reassigned;
}

// The exact reverse: move every reassigned record back to the merged
// customer, using the precise list captured at merge time — not a
// re-derivation, since the primary customer may have accumulated its
// own new records since the merge that must NOT be moved.
export async function rollbackCustomerMerge(tx: any, mergedCustomerId: string, reassignedRecords: ReassignedRecord[]): Promise<void> {
  for (const record of reassignedRecords) {
    await tx[record.model].update({ where: { id: record.id }, data: { customerId: mergedCustomerId } });
  }
  await tx.customer.update({ where: { id: mergedCustomerId }, data: { mergeStatus: "ACTIVE", mergedIntoCustomerId: null } });
}
