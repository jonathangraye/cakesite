data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

data "aws_route53_zone" "main" {
  name         = var.hosted_zone_name
  private_zone = false
}

locals {
  oidc_arn      = data.aws_iam_openid_connect_provider.github.arn
  state_arn     = aws_s3_bucket.state.arn
  site_bucket   = "arn:aws:s3:::${var.project}-site-${local.account_id}"
  record_names  = flatten([for d in var.site_domains : [d, "*.${d}"]])
  role_prefix   = "arn:aws:iam::${local.account_id}:role/${var.project}-*"
  boundary_cond = aws_iam_policy.workload_boundary.arn
}

data "aws_iam_policy_document" "deploy_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${var.github_sub_prefix}:ref:refs/heads/main"]
    }
  }
}

data "aws_iam_policy_document" "plan_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["${var.github_sub_prefix}:pull_request"]
    }
  }
}

# --- Deploy role (push to main) ---

data "aws_iam_policy_document" "deploy_site" {
  statement {
    sid       = "Identity"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }

  statement {
    sid       = "StateList"
    actions   = ["s3:ListBucket"]
    resources = [local.state_arn]
  }

  statement {
    sid       = "StateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${local.state_arn}/*"]
  }

  statement {
    sid       = "SiteBucket"
    actions   = ["s3:*"]
    resources = [local.site_bucket, "${local.site_bucket}/*"]
  }

  statement {
    sid     = "CloudFrontManage"
    actions = ["cloudfront:*"]
    resources = [
      "arn:aws:cloudfront::${local.account_id}:distribution/*",
      "arn:aws:cloudfront::${local.account_id}:function/${var.project}-*",
      "arn:aws:cloudfront::${local.account_id}:origin-access-control/*",
    ]
  }

  statement {
    sid       = "CloudFrontRead"
    actions   = ["cloudfront:Get*", "cloudfront:List*", "cloudfront:Describe*"]
    resources = ["*"]
  }

  statement {
    sid       = "CertificatesRequest"
    actions   = ["acm:RequestCertificate", "acm:ListCertificates"]
    resources = ["*"]
  }

  statement {
    sid       = "Certificates"
    actions   = ["acm:*"]
    resources = ["arn:aws:acm:us-east-1:${local.account_id}:certificate/*"]
  }

  statement {
    sid       = "DnsRead"
    actions   = ["route53:ListHostedZones", "route53:ListHostedZonesByName", "route53:GetChange"]
    resources = ["*"]
  }

  statement {
    sid       = "DnsZoneRead"
    actions   = ["route53:GetHostedZone", "route53:ListResourceRecordSets", "route53:ListTagsForResource"]
    resources = [data.aws_route53_zone.main.arn]
  }

  statement {
    sid       = "DnsSiteRecords"
    actions   = ["route53:ChangeResourceRecordSets"]
    resources = [data.aws_route53_zone.main.arn]
    condition {
      test     = "ForAllValues:StringLike"
      variable = "route53:ChangeResourceRecordSetsNormalizedRecordNames"
      values   = local.record_names
    }
  }
}

data "aws_iam_policy_document" "deploy_app" {
  statement {
    sid       = "Lambda"
    actions   = ["lambda:*"]
    resources = ["arn:aws:lambda:${local.region}:${local.account_id}:function:${var.project}-*"]
  }

  statement {
    sid       = "HttpApi"
    actions   = ["apigateway:GET", "apigateway:POST", "apigateway:PUT", "apigateway:PATCH", "apigateway:DELETE"]
    resources = ["arn:aws:apigateway:${local.region}::/apis", "arn:aws:apigateway:${local.region}::/apis/*", "arn:aws:apigateway:${local.region}::/tags/*"]
  }

  statement {
    sid = "RolesRead"
    actions = [
      "iam:GetRole", "iam:ListRolePolicies", "iam:GetRolePolicy", "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole", "iam:DeleteRole", "iam:DeleteRolePolicy", "iam:TagRole", "iam:UntagRole",
      "iam:UpdateRole", "iam:UpdateAssumeRolePolicy",
    ]
    resources = [local.role_prefix]
  }

  statement {
    sid       = "RolesWriteWithBoundary"
    actions   = ["iam:CreateRole", "iam:PutRolePolicy", "iam:PutRolePermissionsBoundary"]
    resources = [local.role_prefix]
    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.boundary_cond]
    }
  }

  statement {
    sid       = "PassRolesToLambda"
    actions   = ["iam:PassRole"]
    resources = [local.role_prefix]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  statement {
    sid       = "BoundaryRead"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion"]
    resources = [local.boundary_cond]
  }

  statement {
    sid = "LogGroups"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy", "logs:DeleteRetentionPolicy",
      "logs:TagResource", "logs:UntagResource", "logs:ListTagsForResource", "logs:TagLogGroup",
    ]
    resources = [
      "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.project}-*",
      "arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.project}-*:*",
    ]
  }

  statement {
    sid       = "LogGroupsDescribe"
    actions   = ["logs:DescribeLogGroups"]
    resources = ["*"]
  }

  statement {
    sid = "TablesControlPlane"
    actions = [
      "dynamodb:CreateTable", "dynamodb:DeleteTable", "dynamodb:DescribeTable", "dynamodb:UpdateTable",
      "dynamodb:DescribeContinuousBackups", "dynamodb:UpdateContinuousBackups", "dynamodb:DescribeTimeToLive",
      "dynamodb:UpdateTimeToLive", "dynamodb:TagResource", "dynamodb:UntagResource", "dynamodb:ListTagsOfResource",
    ]
    resources = ["arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.project}-*"]
  }

  statement {
    sid = "AlertTopics"
    actions = [
      "sns:CreateTopic", "sns:DeleteTopic", "sns:GetTopicAttributes", "sns:SetTopicAttributes", "sns:TagResource",
      "sns:UntagResource", "sns:ListTagsForResource", "sns:Subscribe", "sns:Unsubscribe",
      "sns:GetSubscriptionAttributes", "sns:SetSubscriptionAttributes", "sns:ListSubscriptionsByTopic",
    ]
    resources = ["arn:aws:sns:${local.region}:${local.account_id}:${var.project}-*"]
  }

  statement {
    sid       = "Alarms"
    actions   = ["cloudwatch:PutMetricAlarm", "cloudwatch:DeleteAlarms", "cloudwatch:TagResource", "cloudwatch:UntagResource", "cloudwatch:ListTagsForResource"]
    resources = ["arn:aws:cloudwatch:${local.region}:${local.account_id}:alarm:${var.project}-*"]
  }

  statement {
    sid       = "AlarmsDescribe"
    actions   = ["cloudwatch:DescribeAlarms"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "deploy_site" {
  name   = "github-${var.project}-deploy-site"
  policy = data.aws_iam_policy_document.deploy_site.json
}

resource "aws_iam_policy" "deploy_app" {
  name   = "github-${var.project}-deploy-app"
  policy = data.aws_iam_policy_document.deploy_app.json
}

resource "aws_iam_role" "deploy" {
  name                 = "github-${var.project}-deploy"
  description          = "Assumed by GitHub Actions on pushes to main in ${var.github_repo}."
  assume_role_policy   = data.aws_iam_policy_document.deploy_trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "deploy_site" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy_site.arn
}

resource "aws_iam_role_policy_attachment" "deploy_app" {
  role       = aws_iam_role.deploy.name
  policy_arn = aws_iam_policy.deploy_app.arn
}

# --- Plan role (pull requests): read-only, and kept away from secrets and customer data ---

data "aws_iam_policy_document" "plan_extra" {
  statement {
    sid       = "StateRead"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [local.state_arn, "${local.state_arn}/*"]
  }

  statement {
    sid    = "DenySecretsAndCustomerData"
    effect = "Deny"
    actions = [
      "ssm:GetParameter*", "secretsmanager:GetSecretValue", "kms:Decrypt",
      "dynamodb:GetItem", "dynamodb:BatchGetItem", "dynamodb:Query", "dynamodb:Scan",
      "dynamodb:ExportTableToPointInTime", "logs:GetLogEvents", "logs:FilterLogEvents", "logs:StartQuery",
      "lambda:GetFunction",
    ]
    resources = ["*"]
  }

  statement {
    sid           = "DenyOtherBucketObjects"
    effect        = "Deny"
    actions       = ["s3:GetObject"]
    not_resources = ["${local.state_arn}/*", "${local.site_bucket}/*"]
  }
}

resource "aws_iam_policy" "plan_extra" {
  name   = "github-${var.project}-plan"
  policy = data.aws_iam_policy_document.plan_extra.json
}

resource "aws_iam_role" "plan" {
  name                 = "github-${var.project}-plan"
  description          = "Assumed by GitHub Actions for terraform plan on pull requests in ${var.github_repo}."
  assume_role_policy   = data.aws_iam_policy_document.plan_trust.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:aws:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy_attachment" "plan_extra" {
  role       = aws_iam_role.plan.name
  policy_arn = aws_iam_policy.plan_extra.arn
}
