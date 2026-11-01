terraform {
  backend "s3" {
    bucket       = "cakesite-tfstate-856359718185"
    key          = "cakesite/bootstrap.tfstate"
    region       = "eu-west-2"
    encrypt      = true
    use_lockfile = true
  }
}
