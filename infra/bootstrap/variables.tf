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
