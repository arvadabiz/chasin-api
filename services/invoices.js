import { supabase } from '../db/index.js'

export async function upsertInvoice(invoiceData) {
    return { id: 'mock-invoice-id', ...invoiceData }
}

export async function getInvoices(accountId) {
    const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('account_id', accountId)
    
    if (error) throw error
    console.log('Invoices fetched:', data)
    return data
}

export async function getOverdueInvoices(accountId) {
    const today = new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('account_id', accountId)
        .eq('status', 'pending')
        .lte('due_date', today)

    if (error) throw error
    return data
}

export async function markInvoicePaid(invoiceId) {
    return { id: invoiceId, status: 'paid' }
}