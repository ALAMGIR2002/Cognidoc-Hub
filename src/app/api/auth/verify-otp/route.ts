import { NextResponse } from "next/server";
import { verifyOTP } from "@/lib/otp-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { identifier, otp } = (await request.json()) as {
      identifier: string;
      otp: string;
    };

    if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
      return NextResponse.json(
        { error: "Email or phone number is required." },
        { status: 400 }
      );
    }

    if (!otp || typeof otp !== "string" || !otp.trim()) {
      return NextResponse.json(
        { error: "Verification code is required." },
        { status: 400 }
      );
    }

    const cleanId = identifier.trim();
    const cleanOtp = otp.trim();

    const isValid = verifyOTP(cleanId, cleanOtp);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid or expired verification code. Please try again." },
        { status: 400 }
      );
    }

    // OTP is valid, construct the user profile
    const isEmail = cleanId.includes("@");
    let user;

    if (isEmail) {
      const username = cleanId.split("@")[0];
      user = {
        username: username,
        email: cleanId,
        phoneNumber: "",
      };
    } else {
      user = {
        username: cleanId,
        email: "",
        phoneNumber: cleanId,
      };
    }

    return NextResponse.json({
      success: true,
      user,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to verify OTP.";
    console.error("Error verifying OTP:", err);
    return NextResponse.json(
      { error: `Failed to verify OTP: ${message}` },
      { status: 500 }
    );
  }
}
