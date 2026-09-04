export function ResubmissionNotice({
  revisionCount,
  previousRemarks,
}: {
  revisionCount: number;
  previousRemarks: string | null;
}) {
  if (revisionCount < 1) return null;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
      <p className="font-semibold">
        This is a resubmission (revision {revisionCount}) after being sent back with corrections.
      </p>
      {previousRemarks ? (
        <p className="mt-2 whitespace-pre-wrap">Previous remarks: {previousRemarks}</p>
      ) : null}
    </div>
  );
}
