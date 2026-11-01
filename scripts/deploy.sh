#!/bin/sh
# Builds the site and Lambda, applies Terraform, then uploads the site to S3.
set -eu
cd "$(dirname "$0")/.."

PROFILE="${AWS_PROFILE:-default}"

npm run build
# Extra arguments go to terraform apply, e.g. `npm run deploy -- -auto-approve`.
terraform -chdir=infra apply "$@"

BUCKET="$(terraform -chdir=infra output -raw site_bucket)"
DIST_ID="$(terraform -chdir=infra output -raw distribution_id)"

# Hashed assets never change, so cache them for a year. Everything else revalidates.
aws --profile "$PROFILE" s3 sync dist/_astro "s3://$BUCKET/_astro" --no-progress \
  --cache-control "public,max-age=31536000,immutable"
aws --profile "$PROFILE" s3 sync dist/ "s3://$BUCKET" --no-progress --delete --exclude "_astro/*" \
  --cache-control "public,max-age=0,must-revalidate"
aws --profile "$PROFILE" cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

echo "Deployed to $(terraform -chdir=infra output -raw site_url)"
