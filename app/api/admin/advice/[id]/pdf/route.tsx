import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db } from "@/lib/db";
import { paymentAdvices, auditLog } from "@/lib/db/schema";
import { PaymentAdviceDocument } from "@/lib/pdf/PaymentAdviceDocument";

export const runtime = "nodejs";

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const [advice] = await db
    .select()
    .from(paymentAdvices)
    .where(eq(paymentAdvices.id, id))
    .limit(1);

  if (!advice) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (advice.status !== "APPROVED") {
    return NextResponse.json(
      { error: "The Payment Advice PDF is only available once approved." },
      { status: 409 },
    );
  }

  const buffer = await renderToBuffer(
    <PaymentAdviceDocument
      data={{
        serialNo: advice.serialNo,
        formDate: advice.formDate,
        payeeName: advice.payeeName,
        payeeAddress: advice.payeeAddress,
        payeeEmail: advice.payeeEmail,
        payeeContactPerson: advice.payeeContactPerson,
        payeeContactPhone: advice.payeeContactPhone,
        poNumber: advice.poNumber,
        poDate: advice.poDate,
        deliveryChallanNo: advice.deliveryChallanNo,
        deliveryChallanDate: advice.deliveryChallanDate,
        billNo: advice.billNo,
        billDate: advice.billDate,
        amount: advice.amount,
        billPassedFor: advice.billPassedFor,
        natureOfExpenditure: advice.natureOfExpenditure,
        enclosures: advice.enclosures,
        specialRemarks: advice.specialRemarks,
        paymentMode: advice.paymentMode as "NEFT" | "CASH",
        bankAccountNo: advice.bankAccountNo,
        bankIfsc: advice.bankIfsc,
        beneficiaryName: advice.beneficiaryName,
        submittedByName: advice.submittedByName,
        submittedAt: advice.submittedAt.toISOString(),
        approvedAt: advice.approvedAt ? advice.approvedAt.toISOString() : null,
        approvedByName: advice.approvedByName,
      }}
    />,
  );

  await db.insert(auditLog).values({
    paymentAdviceId: advice.id,
    action: "PDF_GENERATED",
    actor: "ADMIN",
    ipAddress: clientIp(req),
    details: { serialNo: advice.serialNo },
  });

  const filename = `${advice.serialNo.replace(/\//g, "-")}.pdf`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
