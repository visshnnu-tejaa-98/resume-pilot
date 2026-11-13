import { RemovalPolicy, SecretValue, Stack, type StackProps, Tags } from "aws-cdk-lib";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import type { Construct } from "constructs";

const PLACEHOLDER = "REPLACE_ME";

/**
 * Placeholder secrets for every third-party credential the app needs
 * (prd.md §14.1). Created empty/placeholder here so the ECS task
 * definitions have a stable ARN to reference from day one; the real
 * values are set manually post-deploy —
 * `aws secretsmanager put-secret-value --secret-id <arn> --secret-string '...'`
 * or via the console — and are NEVER committed to this repo.
 *
 * RDS credentials are not here: DataStack generates them itself via
 * `rds.Credentials.fromGeneratedSecret`, which is the AWS-recommended
 * pattern (auto-generated, auto-rotatable, never touches this file).
 */
export class SecretsStack extends Stack {
  public readonly clerk: secretsmanager.Secret;
  public readonly razorpay: secretsmanager.Secret;
  public readonly openai: secretsmanager.Secret;
  public readonly sesSmtp: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.clerk = new secretsmanager.Secret(this, "ClerkSecret", {
      secretName: "resume-pilot/clerk",
      description: "Clerk auth — secret key + webhook signing secret",
      removalPolicy: RemovalPolicy.RETAIN,
      secretObjectValue: {
        CLERK_SECRET_KEY: SecretValue.unsafePlainText(PLACEHOLDER),
        CLERK_WEBHOOK_SECRET: SecretValue.unsafePlainText(PLACEHOLDER),
      },
    });

    this.razorpay = new secretsmanager.Secret(this, "RazorpaySecret", {
      secretName: "resume-pilot/razorpay",
      description: "Razorpay API key + webhook signing secret",
      removalPolicy: RemovalPolicy.RETAIN,
      secretObjectValue: {
        RAZORPAY_KEY_ID: SecretValue.unsafePlainText(PLACEHOLDER),
        RAZORPAY_KEY_SECRET: SecretValue.unsafePlainText(PLACEHOLDER),
        RAZORPAY_WEBHOOK_SECRET: SecretValue.unsafePlainText(PLACEHOLDER),
      },
    });

    this.openai = new secretsmanager.Secret(this, "OpenAiSecret", {
      secretName: "resume-pilot/openai",
      description: "OpenAI API key",
      removalPolicy: RemovalPolicy.RETAIN,
      secretObjectValue: {
        OPENAI_API_KEY: SecretValue.unsafePlainText(PLACEHOLDER),
      },
    });

    this.sesSmtp = new secretsmanager.Secret(this, "SesSmtpSecret", {
      secretName: "resume-pilot/ses-smtp",
      description:
        "SES SMTP credentials for Nodemailer — generate via SES console once the sending domain (m11-email/01) is verified",
      removalPolicy: RemovalPolicy.RETAIN,
      secretObjectValue: {
        SES_SMTP_USER: SecretValue.unsafePlainText(PLACEHOLDER),
        SES_SMTP_PASSWORD: SecretValue.unsafePlainText(PLACEHOLDER),
      },
    });

    Tags.of(this).add("Project", "resume-pilot");
  }
}
