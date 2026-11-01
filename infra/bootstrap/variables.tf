variable "project" {
  type    = string
  default = "cakesite"
}

variable "aws_region" {
  type    = string
  default = "eu-west-2"
}

variable "github_repo" {
  description = "owner/name of the GitHub repo allowed to deploy."
  type        = string
  default     = "jonathangraye/cakesite"
}

variable "github_sub_prefix" {
  description = "OIDC subject prefix for the repo. The repo uses GitHub's immutable subject format (owner@id/repo@id), so a renamed or recreated repo can't inherit access. Check with: gh api repos/OWNER/REPO/actions/oidc/customization/sub"
  type        = string
  default     = "repo:jonathangraye@71887682/cakesite@1441907430"
}

variable "hosted_zone_name" {
  type    = string
  default = "graye.co.uk"
}

variable "site_domains" {
  description = "DNS names the deploy role may create records for. Subdomains (e.g. ACM validation records) are included."
  type        = list(string)
  default     = ["cake.graye.co.uk"]
}

# The deploy role may only change these existing CloudFront and ACM resources, because the account
# also hosts other sites. If Terraform ever needs to replace one, apply bootstrap from your Mac with
# the new ID first (find it with `terraform -chdir=infra state show`).
variable "cloudfront_distribution_id" {
  type    = string
  default = "E1R1HKLBFXWJDX"
}

variable "cloudfront_oac_id" {
  type    = string
  default = "E1DK2LZL4HIAX0"
}

variable "certificate_arn" {
  description = "The us-east-1 ACM certificate for the site."
  type        = string
  default     = "arn:aws:acm:us-east-1:856359718185:certificate/dced18a1-51f4-4d46-b6f3-8439d270ebf1"
}
