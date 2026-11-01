variable "project" {
  description = "Name prefix for all resources."
  type        = string
  default     = "cakesite"
}

variable "aws_profile" {
  description = "AWS CLI profile to deploy with."
  type        = string
  default     = "default"
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
