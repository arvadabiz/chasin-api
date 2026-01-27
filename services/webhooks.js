import { handleStripeWebhook as billingWebhook } from './billing.js'

export async function handleStripeWebhook(req) {
    console.log('handleStripeWebhook proxy called')
    await billingWebhook(req)
    return true
}

export async function handleIntegrationWebhook(req) {
    console.log('handleIntegrationWebhook called with body:', req.body)
    return true
}