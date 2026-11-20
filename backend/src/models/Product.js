const {
  defineModel,
  str,
  num,
  reqStr,
  reqNum,
  createdAt,
} = require("./defineModel");

module.exports = defineModel(
  "Product",
  "products",
  {
    name: reqStr(),
    brand_id: reqNum(),
    category_id: reqNum(),
    sku: { type: String, required: false },
    unit: reqStr(),
    min_order_qty: num(1),
    standard_rate: num(0),
    description: str(""),
    image_url: str(""),
    item_colour: str("Golden Yellow"),
    status: str("active"),
    created_at: createdAt(),
  },
  [{ brand_id: 1 }, { category_id: 1 }],
);
