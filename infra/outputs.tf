output "site_url" {
  value = "https://${var.domain_name}"
}

output "site_bucket" {
  value = aws_s3_bucket.site.bucket
}

output "distribution_id" {
  value = aws_cloudfront_distribution.site.id
}

output "api_endpoint" {
  value = aws_apigatewayv2_api.checkout.api_endpoint
}

output "stripe_secret_param_name" {
  value = var.stripe_secret_param_name
}
