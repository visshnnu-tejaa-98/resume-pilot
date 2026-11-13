import { Duration, RemovalPolicy, Stack, type StackProps, Tags } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import type { Construct } from "constructs";

/**
 * Private files bucket — prd.md §5.2.
 *
 * The PRD describes the lifecycle rule as applying to
 * `users/<userId>/uploads/`, but S3 lifecycle rules can't glob a
 * dynamic per-user prefix like `users/*\/uploads/`. Instead, the upload
 * wrapper (tasks/todo/m3-upload-storage/01-s3-storage-wrapper.md) must
 * tag every object it puts under an `uploads/` path with
 * `category=upload`; this rule expires anything with that tag after 30
 * days. Generated PDFs are untagged (or tagged `category=generated`)
 * and are unaffected.
 */
export class StorageStack extends Stack {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.bucket = new s3.Bucket(this, "FilesBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: false,
      removalPolicy: RemovalPolicy.RETAIN,
      lifecycleRules: [
        {
          id: "expire-tagged-uploads-after-30-days",
          enabled: true,
          tagFilters: { category: "upload" },
          expiration: Duration.days(30),
        },
        {
          id: "abort-incomplete-multipart-uploads",
          enabled: true,
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
      // GET only: prd.md §5.2 — the server uploads to S3, the browser
      // never gets write access. This is only for the browser to fetch
      // a presigned download/preview URL's bytes directly (e.g. into a
      // PDF viewer), never to PUT.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          maxAge: 300,
        },
      ],
    });

    Tags.of(this).add("Project", "resume-pilot");
  }
}
