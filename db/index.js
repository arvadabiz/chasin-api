import { createClient } from '@supabase/supabase-js'
import { config } from '../config/index.js'

export const supabase = createClient(config.supabaseUrl, config.supabaseKey)

export async function testConnection() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .limit(1)

        if (error) throw error
        console.log('Supabase connection OK, first row:', data[0])
    } catch (err) {
        console.error('Failed to connect to Supabase:', err)
    }
}