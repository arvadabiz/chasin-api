export async function createCheckoutSession(accountId) {
    console.log('createCheckoutSession called for account:', accountId)
    return { url: 'https://checkout.stripe.mock' }
}

export async function handleStripeWebhook(req) {
    console.log('handleStripeWebhook called with body:', req.body.toString())
    return true
}

export async function getSubscriptionStatus(accountId) {
    console.log('getSubscriptionStatus called for account:', accountId)
    return 'active'
}