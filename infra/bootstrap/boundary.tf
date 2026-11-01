# Every role the deploy pipeline creates must carry this boundary, so a
# compromised workflow can't mint a role with more access than the app needs.
#
# The deploy role can also set who may assume those roles. lambda:SourceFunctionArn is only
# present when the app's own Lambda code makes the call, so a role assumed from anywhere else
# (for example a backdoor trust policy) can't read secrets or orders, or send alerts.
locals {
  app_functions = "arn:aws:lambda:${local.region}:${local.account_id}:function:${var.project}-*"
}

data "aws_iam_policy_document" "workload_boundary" {
  statement {
    sid       = "Logs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["arn:aws:logs:${local.region}:${local.account_id}:log-group:/aws/lambda/${var.project}-*:*"]
  }

  statement {
    sid       = "ReadAppSecrets"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${local.region}:${local.account_id}:parameter/${var.project}/*"]

    condition {
      test     = "ArnLike"
      variable = "lambda:SourceFunctionArn"
      values   = [local.app_functions]
    }
  }

  statement {
    sid = "Orders"
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:Query",
      "dynamodb:ConditionCheckItem",
    ]
    resources = [
      "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.project}-*",
      "arn:aws:dynamodb:${local.region}:${local.account_id}:table/${var.project}-*/index/*",
    ]

    condition {
      test     = "ArnLike"
      variable = "lambda:SourceFunctionArn"
      values   = [local.app_functions]
    }
  }

  statement {
    sid       = "Alerts"
    actions   = ["sns:Publish"]
    resources = ["arn:aws:sns:${local.region}:${local.account_id}:${var.project}-*"]

    condition {
      test     = "ArnLike"
      variable = "lambda:SourceFunctionArn"
      values   = [local.app_functions]
    }
  }
}

resource "aws_iam_policy" "workload_boundary" {
  name        = "${var.project}-workload-boundary"
  description = "Permissions boundary for roles created by the ${var.project} deploy pipeline."
  policy      = data.aws_iam_policy_document.workload_boundary.json
}
