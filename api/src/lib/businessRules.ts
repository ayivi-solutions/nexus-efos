// doc §41 Business Rules Framework — the actual evaluation engine.
// Conditions are [{ field, operator, value }], evaluated against a plain
// "context" object built from real data (e.g. a just-created loan plus
// its customer) at the moment a trigger point fires. Deliberately a small,
// well-defined operator set rather than a generic expression language —
// §41.9 calls for "configuration driven," not "write code in a text box."

export type ConditionOperator =
  | "EQUALS" | "NOT_EQUALS"
  | "GREATER_THAN" | "GREATER_THAN_OR_EQUAL"
  | "LESS_THAN" | "LESS_THAN_OR_EQUAL"
  | "CONTAINS";

export interface RuleCondition {
  field: string;
  operator: ConditionOperator;
  value: string | number;
}

export interface RuleAction {
  type: "FLAG" | "REQUIRE_ADDITIONAL_APPROVAL" | "REJECT";
  message?: string;
}

function getField(context: Record<string, any>, field: string): any {
  // Supports one level of dot-notation (e.g. "customer.riskRating") since
  // the real contexts this evaluates against (a loan + its customer) are
  // exactly one level deep — not building a full path-parser for a case
  // that doesn't exist yet.
  const parts = field.split(".");
  let value: any = context;
  for (const part of parts) {
    if (value == null) return undefined;
    value = value[part];
  }
  return value;
}

function evaluateCondition(context: Record<string, any>, condition: RuleCondition): boolean {
  const actual = getField(context, condition.field);
  if (actual === undefined) return false;

  const expected = condition.value;
  const actualNum = Number(actual);
  const expectedNum = Number(expected);
  const bothNumeric = !isNaN(actualNum) && !isNaN(expectedNum);

  switch (condition.operator) {
    case "EQUALS":
      return bothNumeric ? actualNum === expectedNum : String(actual) === String(expected);
    case "NOT_EQUALS":
      return bothNumeric ? actualNum !== expectedNum : String(actual) !== String(expected);
    case "GREATER_THAN":
      return bothNumeric && actualNum > expectedNum;
    case "GREATER_THAN_OR_EQUAL":
      return bothNumeric && actualNum >= expectedNum;
    case "LESS_THAN":
      return bothNumeric && actualNum < expectedNum;
    case "LESS_THAN_OR_EQUAL":
      return bothNumeric && actualNum <= expectedNum;
    case "CONTAINS":
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    default:
      return false;
  }
}

export function ruleMatches(context: Record<string, any>, conditions: RuleCondition[], conditionLogic: string): boolean {
  if (conditions.length === 0) return false;
  const results = conditions.map((c) => evaluateCondition(context, c));
  return conditionLogic === "ANY" ? results.some(Boolean) : results.every(Boolean);
}

// Split into two steps deliberately, for trigger points where the target
// record doesn't exist yet at evaluation time (Customer Creation, Savings
// Account Opening): matchRules is a pure check, safe to call BEFORE
// creating anything, so a REJECT action can block creation outright rather
// than creating a record and immediately marking it rejected. Once it's
// known nothing will be rejected, the entity is created for real, and
// executeMatchedRules applies FLAG/REQUIRE_ADDITIONAL_APPROVAL against
// its now-real ID. Loan Initiation is the one deliberate exception — a
// loan application is itself the record of an attempt, so REJECT there
// creates the loan and immediately marks it REJECTED, rather than
// pretending the attempt never happened.
export interface MatchedRule {
  rule: { id: string; ruleCode: string; name: string; actions: unknown };
  hasReject: boolean;
}

export async function matchRules(
  prisma: any,
  institutionId: string,
  triggerPoint: string,
  context: Record<string, any>
): Promise<MatchedRule[]> {
  const activeRules = await prisma.businessRule.findMany({
    where: {
      institutionId, status: "ACTIVE", triggerPoint,
      OR: [{ effectiveDate: null }, { effectiveDate: { lte: new Date() } }],
      AND: [{ OR: [{ expiryDate: null }, { expiryDate: { gte: new Date() } }] }],
    },
    orderBy: { priority: "asc" },
  });

  const matched: MatchedRule[] = [];
  for (const rule of activeRules) {
    const conditions = rule.conditions as unknown as RuleCondition[];
    if (!ruleMatches(context, conditions, rule.conditionLogic)) continue;
    const actions = rule.actions as unknown as RuleAction[];
    matched.push({ rule, hasReject: actions.some((a) => a.type === "REJECT") });
  }
  return matched;
}

export async function executeMatchedRules(
  prisma: any,
  institutionId: string,
  userId: string,
  targetType: string,
  targetId: string,
  matched: MatchedRule[]
): Promise<{ ruleCode: string; ruleName: string; actionsTaken: string[] }[]> {
  const results: { ruleCode: string; ruleName: string; actionsTaken: string[] }[] = [];

  for (const { rule } of matched) {
    const actions = rule.actions as unknown as RuleAction[];
    const actionsTaken: string[] = [];

    for (const action of actions) {
      if (action.type === "FLAG") {
        await prisma.auditLog.create({
          data: { institutionId, userId, action: "business_rule.flagged", resource: targetType, resourceId: targetId, metadata: { ruleId: rule.id, ruleCode: rule.ruleCode, message: action.message } },
        });
        actionsTaken.push("FLAG");
      } else if (action.type === "REQUIRE_ADDITIONAL_APPROVAL") {
        await prisma.approvalRequest.create({
          data: {
            institutionId, type: "BUSINESS_RULE_TRIGGERED", targetType, targetId,
            payload: { ruleId: rule.id }, reason: action.message || `Business rule ${rule.ruleCode} (${rule.name}) requires additional approval`,
            requestedById: userId,
          },
        });
        actionsTaken.push("REQUIRE_ADDITIONAL_APPROVAL");
      } else if (action.type === "REJECT") {
        actionsTaken.push("REJECT");
      }
    }

    await prisma.auditLog.create({
      data: { institutionId, userId, action: "business_rule.triggered", resource: targetType, resourceId: targetId, metadata: { ruleId: rule.id, ruleCode: rule.ruleCode, actionsTaken } },
    });
    results.push({ ruleCode: rule.ruleCode, ruleName: rule.name, actionsTaken });
  }

  return results;
}
