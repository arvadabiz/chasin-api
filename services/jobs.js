import { getOverdueInvoices } from './invoices.js'
import { sendInvoiceReminder } from './emails.js'
import { syncInvoices } from './integrations.js'
import { supabase } from '../config/index.js'

export async function runDailyInvoiceCheck() {
    console.log('runDailyInvoiceCheck started')

    try {
        const { data: accounts, error: accountsError } = await supabase
            .from('accounts')
            .select('id, name')

        if (accountsError) {
            console.error('Failed to fetch accounts:', accountsError)
            return false
        }

        for (const account of accounts) {
            console.log('Syncing invoices for account', account.name)
            try {
                await syncInvoices(account.id)
                console.log(`Invoices synced for account ${account.id}`)

                const overdueInvoices = await getOverdueInvoices(account.id)
                console.log(`Found ${overdueInvoices.length} overdue invoices for account ${account.id}`)

                for (const invoice of overdueInvoices) {
                    try {
                        await sendInvoiceReminder(invoice)
                        console.log(`Sent reminder for invoice ${invoice.id}`)
                    } catch (err) {
                        console.error(`Failed to send reminder for invoice ${invoice.id}:`, err)
                    }
                }
            } catch (err) {
                console.error('Error processing account', account.id, err)
            }
        }
    } catch (err) {
        console.error('Error running daily invoice check:', err)
        return false
    }

    console.log('runDailyInvoiceCheck finished')
    return true
}