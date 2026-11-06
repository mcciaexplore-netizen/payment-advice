import { BRANCH_OPTIONS, DEPARTMENT_OPTIONS } from "@/lib/validation/payment-advice";

export function resolveStaffDepartment(department: string | null) {
  if (!department) return null;

  const option =
    DEPARTMENT_OPTIONS.find((item) => item !== "OTHERS" && item === department) ?? "OTHERS";
  return {
    option,
    submittedByDepartment: option === "OTHERS" ? department : option,
  };
}

export function resolveStaffBranch(branch: string | null) {
  return BRANCH_OPTIONS.find((option) => option === branch) ?? null;
}
