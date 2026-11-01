# Every role the deploy pipeline creates must carry this boundary, so a
# compromised workflow can't mint a role with more access than the app needs.
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
  }

  statement {
    sid       = "Alerts"
    actions   = ["sns:Publish"]
    resources = ["arn:aws:sns:${local.region}:${local.account_id}:${var.project}-*"]
  }
}

resource "aws_iam_policy" "workload_boundary" {
  name        = "${var.project}-workload-boundary"
  description = "Permissions boundary for roles created by the ${var.project} deploy pipeline."
  policy      = data.aws_iam_policy_document.workload_boundary.json
}
