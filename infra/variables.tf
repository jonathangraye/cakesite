# AWS credentials come from the environment: AWS_PROFILE locally, OIDC in GitHub Actions.

variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "cakesite"
}

variable "aws_region" {
  description = "Region for the S3 bucket, Lambda and API."
  type        = string
  default     = "eu-west-2"
}

variable "hosted_zone_name" {
  description = "Existing public Route 53 hosted zone."
  type        = string
  default     = "graye.co.uk"
}

variable "domain_name" {
  description = "Domain the site is served on. Must be in hosted_zone_name."
  type        = string
  default     = "cake.graye.co.uk"
}

variable "stripe_mode" {
  description = "\"test\" or \"live\". The Lambda refuses a key that doesn't match."
  type        = string
  default     = "test"

  validation {
    condition     = contains(["test", "live"], var.stripe_mode)
    error_message = "stripe_mode must be \"test\" or \"live\"."
  }
}

variable "stripe_secret_param_name" {
  description = "SSM SecureString parameter holding the Stripe secret key. Created outside Terraform so the key never enters state."
  type        = string
  default     = "/cakesite/stripe_secret_key"
}

variable "stripe_webhook_secret_param_name" {
  description = "SSM SecureString parameter holding the Stripe webhook signing secret (whsec_...). Created outside Terraform."
  type        = string
  default     = "/cakesite/stripe_webhook_secret"
}

variable "alert_email" {
  description = "Where order and error alerts are emailed. Set by the ALERT_EMAIL repo variable in CI; empty means no email subscription."
  type        = string
  default     = ""
  # Keeps the address out of plan output, which is public on this repo's Actions runs.
  sensitive = true

  validation {
    condition     = var.alert_email == "" || can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be an email address or empty."
  }
}
