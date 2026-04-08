/**
 * Stripe 支付集成
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

class StripeClient {
  constructor() {
    this.stripe = stripe;
  }

  async createCheckoutSession(priceId, customerId, successUrl, cancelUrl) {
    return await this.stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async createCustomer(email, name) {
    return await this.stripe.customers.create({ email, name });
  }

  async retrievePaymentIntent(paymentIntentId) {
    return await this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  async handleWebhook(signature, payload) {
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
    return event;
  }
}

module.exports = StripeClient;
