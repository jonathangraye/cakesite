# --- Orders table: one item per paid Checkout Session, written by the webhook ---

resource "aws_dynamodb_table" "orders" {
  name                        = "${var.project}-orders"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "orderId"
  deletion_protection_enabled = true

  attribute {
    name = "orderId"
    type = "S"
  }

  attribute {
    name = "deliveryDate"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }

  # Lists the orders to bake for a given day.
  global_secondary_index {
    name            = "byDeliveryDate"
    projection_type = "ALL"

    key_schema {
      attribute_name = "deliveryDate"
      key_type       = "HASH"
    }

    key_schema {
      attribute_name = "createdAt"
      key_type       = "RANGE"
    }
  }

  point_in_time_recovery {
    enabled = true
  }

  lifecycle {
    prevent_destroy = true
  }
}

# --- Alerts: address mismatches, failed payments and API errors, by email ---

resource "aws_sns_topic" "alerts" {
  name = "${var.project}-alerts"
}

data "aws_iam_policy_document" "alerts_topic" {
  statement {
    sid       = "CloudWatchAlarms"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = ["arn:aws:cloudwatch:${var.aws_region}:${data.aws_caller_identity.current.account_id}:alarm:${var.project}-*"]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts_topic.json
}

# AWS emails a confirmation link; alerts only arrive once it's clicked.
resource "aws_sns_topic_subscription" "alert_email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "api_errors" {
  alarm_name        = "${var.project}-api-errors"
  alarm_description = "The checkout, order or Stripe webhook API returned server errors. Check the ${var.project}-checkout and ${var.project}-webhook logs in CloudWatch. Stripe retries failed webhooks for 3 days."
  namespace         = "AWS/ApiGateway"
  metric_name       = "5xx"
  dimensions = {
    ApiId = aws_apigatewayv2_api.checkout.id
  }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  ok_actions          = [aws_sns_topic.alerts.arn]
}

# --- Stripe webhook ---

resource "aws_iam_role" "webhook" {
  name                 = "${var.project}-webhook"
  assume_role_policy   = data.aws_iam_policy_document.lambda_assume.json
  permissions_boundary = local.workload_boundary_arn
}

resource "aws_cloudwatch_log_group" "webhook" {
  name              = "/aws/lambda/${var.project}-webhook"
  retention_in_days = 14
}

data "aws_iam_policy_document" "webhook" {
  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.webhook.arn}:*"]
  }

  statement {
    sid     = "ReadStripeSecrets"
    actions = ["ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.stripe_secret_param_name}",
      "arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.stripe_webhook_secret_param_name}",
    ]
  }

  statement {
    sid       = "WriteOrders"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.orders.arn]
  }

  statement {
    sid       = "SendAlerts"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
}

resource "aws_iam_role_policy" "webhook" {
  name   = "${var.project}-webhook"
  role   = aws_iam_role.webhook.id
  policy = data.aws_iam_policy_document.webhook.json
}

data "archive_file" "webhook" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/dist/webhook"
  output_path = "${path.module}/.build/webhook.zip"
}

resource "aws_lambda_function" "webhook" {
  function_name    = "${var.project}-webhook"
  description      = "Records paid orders from Stripe and flags address mismatches."
  role             = aws_iam_role.webhook.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.webhook.output_path
  source_code_hash = data.archive_file.webhook.output_base64sha256
  memory_size      = 256
  timeout          = 15

  environment {
    variables = {
      STRIPE_MODE                 = var.stripe_mode
      STRIPE_SECRET_PARAM         = var.stripe_secret_param_name
      STRIPE_WEBHOOK_SECRET_PARAM = var.stripe_webhook_secret_param_name
      ORDERS_TABLE                = aws_dynamodb_table.orders.name
      ALERT_TOPIC_ARN             = aws_sns_topic.alerts.arn
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.webhook.name
  }

  depends_on = [aws_iam_role_policy.webhook]
}

resource "aws_apigatewayv2_integration" "webhook" {
  api_id                 = aws_apigatewayv2_api.checkout.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.webhook.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "webhook" {
  api_id    = aws_apigatewayv2_api.checkout.id
  route_key = "POST /api/stripe/webhook"
  target    = "integrations/${aws_apigatewayv2_integration.webhook.id}"
}

resource "aws_lambda_permission" "webhook_api_gateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.webhook.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.checkout.execution_arn}/*/POST/api/stripe/webhook"
}
