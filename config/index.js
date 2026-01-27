import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config()

export const config = {
    port: process.env.PORT || 3000,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_KEY,
    jwtSecret: process.env.JWT_SECRET,
    stripeSecret: process.env.STRIPE_SECRET_KEY,
    appUrl: process.env.APP_URL
}

export const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
)