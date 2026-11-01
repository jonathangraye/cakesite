# cakesite

A website for ordering plant-based baked goods. Customers browse the menu, add items to a basket, check their postcode is in the delivery area, pick a preferred delivery date and pay with Stripe Checkout.

- **Site:** [Astro](https://astro.build) static pages, served from S3 through CloudFront at `https://cake.graye.co.uk`.
- **Checkout:** one AWS Lambda behind API Gateway at `/api/checkout`, which creates a Stripe Checkout session.
- **Infrastructure:** Terraform in `infra/`.
- **Orders:** Stripe emails customer receipts and seller notifications. Delivery date, postcode and notes are stored as metadata on each payment in the Stripe dashboard.

## Project layout

```
src/content/menu/      One Markdown file per menu item (_template.md is the template)
src/assets/menu/       Menu photos
src/content.config.ts  The menu item schema: every item is checked against this at build time
src/data/delivery.json Delivery zones, fees, delivery days, lead times, minimum order
src/lib/order-rules.ts Order validation shared by the basket page and the Lambda
src/pages/             Site pages, plus catalog.json (prices the Lambda trusts)
lambda/                Checkout Lambda
infra/                 Terraform (S3, CloudFront, ACM, Route 53, API Gateway, Lambda)
infra/bootstrap/       Terraform state bucket, GitHub deploy roles, permissions boundary
.github/workflows/     CI checks and automatic deploys
scripts/               Lambda bundling, local checkout API, deploy script
```

## Adding or changing menu items

1. Copy `src/content/menu/_template.md` to a new file, e.g. `vegan-carrot-cake.md`. The file name becomes the page URL (`/menu/vegan-carrot-cake/`).
2. Add a photo to `src/assets/menu/` (landscape 4:3, e.g. 1600×1200) and point `image:` at it.
3. Fill in every field. The comments in the template explain each one.
4. Run `npm run build`. If anything is missing or wrong (a missing price, a misspelt allergen, an unknown field, an animal-derived allergen), the build stops and names the file and field.

To hide an item without deleting it, set `available: false`.

Prices are in pounds in the menu files and are converted to pence for Stripe. The Lambda prices every order from the built catalog, never from the browser.

## Delivery rules

Edit `src/data/delivery.json`:

| Field | Meaning |
| --- | --- |
| `zones` | Delivery areas. `districts` are postcode districts (the part before the space, e.g. `BS1`). `feePence` is the delivery fee. |
| `deliveryWeekdays` | Days you deliver. 1 = Monday … 7 = Sunday. |
| `minLeadDays` | Minimum notice for any order. Items can require more with `leadTimeDays`. |
| `maxAdvanceDays` | How far ahead customers can book. |
| `blackoutDates` | Dates with no deliveries (`YYYY-MM-DD`). |
| `minOrderPence` | Minimum basket value before delivery. |

**The zones are placeholders (`XX1`–`XX4`).** Replace them with real districts before launch.

Stripe Checkout cannot restrict addresses by postcode. The site checks the postcode before payment, and the checkout page reminds customers to use an address in that postcode. Check the address against the `delivery_postcode` metadata when you fulfil an order.

## Local development

Requires Node 24 (`/opt/homebrew/bin/node`).

```sh
npm install
npm run dev      # site on http://localhost:4321
npm test         # unit tests
npm run check    # type check
```

To test checkout locally, copy `.env.example` to `.env`, add a Stripe **test** key, then in a second terminal:

```sh
npm run dev:api  # checkout API on http://localhost:8787 (the dev site proxies /api to it)
```

`dev:api` builds the catalog first, so restart it after changing menu items. Use Stripe's test card `4242 4242 4242 4242` with any future expiry and CVC.

## Stripe setup

1. In the Stripe dashboard (test mode), create a restricted key with **Checkout Sessions: Write** permission. A standard `sk_test_` key also works.
2. Store it in AWS SSM Parameter Store. It is read by the Lambda at runtime and never stored in Terraform state or the repo:

   Run these lines one at a time. Paste the key at the prompt (it won't be shown) and press Enter:

   ```sh
   printf 'Stripe secret key: '; read -rs STRIPE_KEY; echo
   [ -n "$STRIPE_KEY" ] && aws --profile default --region eu-west-2 ssm put-parameter \
     --name /cakesite/stripe_secret_key --type SecureString --overwrite --value "$STRIPE_KEY" \
     || echo "No key entered, nothing stored."
   unset STRIPE_KEY
   ```

3. In Stripe, turn on **Settings → Emails → Successful payments** for customer receipts (Stripe doesn't send these in test mode), and turn on email notifications for successful payments under your user's notification settings.

The Lambda refuses a live key unless `stripe_mode = "live"` is set in Terraform, so test deployments can't take real payments.

## Deploying

**Every push to `main` deploys automatically.** GitHub Actions (`.github/workflows/ci.yml`) runs the type check, tests and build (which validates every menu item), then applies Terraform, uploads the site and runs a smoke test. If any check fails, nothing is deployed. Pull requests get the same checks plus a Terraform plan in the run summary.

So editing a menu file in GitHub's web editor and committing to `main` is enough to update the live site.

GitHub signs in to AWS with short-lived OIDC credentials; there are no AWS keys in GitHub. The repo variables `AWS_DEPLOY_ROLE_ARN`, `AWS_PLAN_ROLE_ARN` and `ALERT_EMAIL` point the workflow at the right roles.

### Deploying from your Mac

Requires Terraform 1.10+ and the AWS CLI.

```sh
export AWS_PROFILE=default
terraform -chdir=infra init   # first time only
npm run deploy                # build, terraform apply, upload to S3, invalidate CloudFront
```

### Terraform state and the bootstrap stack

Terraform state lives in the `cakesite-tfstate-856359718185` S3 bucket (versioned, encrypted, with S3 lock files), so your Mac and GitHub Actions share it.

`infra/bootstrap/` holds the things the pipeline depends on and can't manage itself: the state bucket, the GitHub deploy and plan roles, and the `cakesite-workload-boundary` permissions boundary. Every role the pipeline creates must carry that boundary, which caps what the app's Lambdas can do. Apply it from your Mac only, when those need to change:

```sh
AWS_PROFILE=default terraform -chdir=infra/bootstrap apply
```

## Going live checklist

- [ ] Real delivery zones and fees in `src/data/delivery.json`
- [ ] Real business name and email in `src/site.ts`
- [ ] Real photos for every menu item
- [ ] Live Stripe key in SSM and `stripe_mode = "live"` in `infra/terraform.tfvars`
- [ ] Stripe receipt and notification emails turned on
- [ ] Privacy policy and terms pages
