import { NextResponse } from "next/server";
import { saveOTP } from "@/lib/otp-store";
import nodemailer from "nodemailer";
import twilio from "twilio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Email sender function using nodemailer
async function sendEmailOTP(email: string, otp: string) {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || `"CogniDoc Hub" <noreply@cognidoc.com>`;

  if (!host || !user || !pass) {
    console.log(`\n======================================================`);
    console.log(`[SMTP CONFIG MISSING]`);
    console.log(`Verification OTP for Email ${email}: ${otp}`);
    console.log(`======================================================\n`);
    return { sent: false, fallback: true };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: parseInt(port || "587"),
    secure: port === "465",
    auth: {
      user,
      pass,
    },
  });

  const mailOptions = {
    from,
    to: email,
    subject: "Your CogniDoc Hub Verification Code",
    text: `Your CogniDoc Hub verification code is: ${otp}. This code is valid for 5 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff; color: #2d3748;">
        <h2 style="color: #3b82f6; text-align: center; margin-bottom: 20px;">CogniDoc Hub Login</h2>
        <p>Hello,</p>
        <p>You requested a one-time verification code to access your CogniDoc Hub account.</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; background-color: #f3f4f6; padding: 12px 24px; border-radius: 6px; border: 1px dashed #3b82f6; color: #1f2937; display: inline-block;">
            ${otp}
          </span>
        </div>
        <p>This code is valid for <strong>5 minutes</strong>. If you did not request this, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 30px 0;" />
        <p style="font-size: 12px; color: #9ca3af; text-align: center;">CogniDoc Hub &bull; Adaptive AI Document Intelligence</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
  return { sent: true, fallback: false };
}

// SMS sender function using Twilio
async function sendSmsOTP(phone: string, otp: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromPhoneNumber) {
    console.log(`\n======================================================`);
    console.log(`[TWILIO CONFIG MISSING]`);
    console.log(`Verification OTP for Phone ${phone}: ${otp}`);
    console.log(`======================================================\n`);
    return { sent: false, fallback: true };
  }

  const client = twilio(accountSid, authToken);

  await client.messages.create({
    body: `Your CogniDoc Hub verification code is: ${otp}. It will expire in 5 minutes.`,
    from: fromPhoneNumber,
    to: phone,
  });

  return { sent: true, fallback: false };
}

export async function POST(request: Request) {
  try {
    const { identifier, type } = (await request.json()) as {
      identifier: string;
      type?: "email" | "phone";
    };

    if (!identifier || typeof identifier !== "string" || !identifier.trim()) {
      return NextResponse.json(
        { error: "Email or phone number is required." },
        { status: 400 }
      );
    }

    const cleanId = identifier.trim();
    
    // Auto-detect type if not explicitly provided
    const resolvedType = type || (cleanId.includes("@") ? "email" : "phone");

    // Generate secure 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    saveOTP(cleanId, otp);

    let result;
    if (resolvedType === "email") {
      // Basic email regex validation
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanId)) {
        return NextResponse.json(
          { error: "Please enter a valid email address." },
          { status: 400 }
        );
      }
      result = await sendEmailOTP(cleanId, otp);
    } else {
      // Basic E.164 phone number regex validation (starts with +, followed by digits)
      if (!/^\+[1-9]\d{1,14}$/.test(cleanId)) {
        return NextResponse.json(
          { error: "Please enter a valid phone number in international format (e.g. +1234567890)." },
          { status: 400 }
        );
      }
      result = await sendSmsOTP(cleanId, otp);
    }

    return NextResponse.json({
      success: true,
      message: result.fallback
        ? `OTP generated successfully (logged to server console in development mode).`
        : `OTP sent successfully to your ${resolvedType}.`,
      fallback: result.fallback,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send OTP.";
    console.error("Error sending OTP:", err);
    return NextResponse.json(
      { error: `Failed to send OTP: ${message}` },
      { status: 500 }
    );
  }
}
