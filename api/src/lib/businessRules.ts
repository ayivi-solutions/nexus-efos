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
