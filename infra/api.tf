data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "checkout" {
  name               = "${var.project}-checkout"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_cloudwatch_log_group" "checkout" {
  name              = "/aws/lambda/${var.project}-checkout"
  retention_in_days = 14
}

data "aws_iam_policy_document" "checkout" {
  statement {
    sid       = "WriteLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.checkout.arn}:*"]
  }

  statement {
    sid       = "ReadStripeKey"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter${var.stripe_secret_param_name}"]
  }
}

resource "aws_iam_role_policy" "checkout" {
  name   = "${var.project}-checkout"
  role   = aws_iam_role.checkout.id
  policy = data.aws_iam_policy_document.checkout.json
}

data "archive_file" "checkout" {
  type        = "zip"
  source_dir  = "${path.module}/../lambda/dist"
  output_path = "${path.module}/.build/checkout.zip"
}

resource "aws_lambda_function" "checkout" {
  function_name    = "${var.project}-checkout"
  role             = aws_iam_role.checkout.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.checkout.output_path
  source_code_hash = data.archive_file.checkout.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      SITE_URL            = "https://${var.domain_name}"
      STRIPE_MODE         = var.stripe_mode
      STRIPE_SECRET_PARAM = var.stripe_secret_param_name
    }
  }

  logging_config {
    log_format = "Text"
    log_group  = aws_cloudwatch_log_group.checkout.name
  }

  depends_on = [aws_iam_role_policy.checkout]
}

resource "aws_apigatewayv2_api" "checkout" {
  name          = "${var.project}-checkout"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "checkout" {
  api_id                 = aws_apigatewayv2_api.checkout.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.checkout.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "checkout" {
  api_id    = aws_apigatewayv2_api.checkout.id
  route_key = "POST /api/checkout"
  target    = "integrations/${aws_apigatewayv2_integration.checkout.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.checkout.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_burst_limit = 20
    throttling_rate_limit  = 10
  }
}

resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.checkout.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.checkout.execution_arn}/*/*"
}
