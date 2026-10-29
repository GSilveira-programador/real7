ALTER TABLE "Variant" ADD CONSTRAINT "stock_nonnegative" CHECK (stock >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "price_positive" CHECK (price > 0), ADD CONSTRAINT "discount_valid" CHECK ("compareAt" IS NULL OR "compareAt" > price);
ALTER TABLE "Coupon" ADD CONSTRAINT "coupon_percent" CHECK (percent BETWEEN 1 AND 80), ADD CONSTRAINT "coupon_usage" CHECK (used >= 0 AND ("limit" IS NULL OR used <= "limit")), ADD CONSTRAINT "coupon_minimum" CHECK (minimum >= 0);
ALTER TABLE "OrderItem" ADD CONSTRAINT "item_quantity" CHECK (quantity BETWEEN 1 AND 10), ADD CONSTRAINT "item_price" CHECK (price > 0);
ALTER TABLE "Order" ADD CONSTRAINT "order_totals" CHECK (subtotal > 0 AND discount >= 0 AND shipping >= 0 AND total = subtotal - discount + shipping AND total > 0);
ALTER TABLE "Review" ADD CONSTRAINT "review_rating" CHECK (rating BETWEEN 1 AND 5);
