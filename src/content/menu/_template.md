---
# MENU ITEM TEMPLATE
# Copy this file to a new name in this folder, e.g. "vegan-carrot-cake.md".
# The file name becomes the page address: /menu/vegan-carrot-cake/
# Files starting with "_" (like this one) are never shown on the site.
# If a field is missing or wrong, `npm run build` stops and names the file and field.

# Shown as the heading. 2-60 characters.
name: Example Bake

# One sentence for menu cards and search results. 10-160 characters.
summary: A short, tempting description of the bake.

# One of: cakes, cupcakes, cookies, brownies-and-bars, breads, pastries
category: cakes

# Photo saved in src/assets/menu/. Landscape 4:3 works best (e.g. 1600x1200).
image: ../../assets/menu/example.png
# Describe the photo for screen readers.
imageAlt: A slice of example bake on a white plate

# Sizes or pack options. At least one. Price is in pounds (24.50 = £24.50).
# id: lowercase letters, numbers and hyphens, unique within this item.
variants:
  - id: 6-inch
    label: 6 inch (serves 8)
    price: 28.00
  - id: 8-inch
    label: 8 inch (serves 14)
    price: 38.00

# Allergens the item CONTAINS. Use [] if none. Choose from:
# celery, gluten, crustaceans, eggs, fish, lupin, milk, molluscs, mustard,
# peanuts, sesame, soya, sulphites, tree-nuts
# (eggs, milk, fish, crustaceans and molluscs are rejected: everything is plant-based)
allergens: [gluten, soya]

# Optional: cross-contamination warnings. Any allergen from the list above.
mayContain: [tree-nuts, peanuts]

# Optional: gluten-free, nut-free, soya-free, refined-sugar-free
dietary: []

# Full ingredient list, with allergens in capitals.
ingredients: WHEAT flour, sugar, SOYA milk, rapeseed oil, cocoa, raising agent, salt.

# Optional (default 2): days' notice this item needs before delivery.
leadTimeDays: 3

# Optional (default true): set to false to hide the "Add to basket" button.
available: true

# Optional (default false): show on the home page.
featured: false

# Optional (default 100): lower numbers appear first within the category.
sortOrder: 100
---

Write the longer description here in plain Markdown. Talk about flavour,
texture, how to store it, and serving suggestions.
