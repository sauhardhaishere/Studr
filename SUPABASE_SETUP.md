# Supabase Setup Guide

To make your data save across devices and for all users, follow these steps:

## 1. Create a Supabase Project
1. Go to [Supabase](https://supabase.com/) and create a new project.
2. Copy your **URL** and **Anon Key** from the project settings.
3. Create a `.env` file in your project root (copy from `.env.example`) and paste your keys.

## 2. Run this SQL in the SQL Editor
Go to the **SQL Editor** in your Supabase dashboard and run the following code to create the necessary tables:

```sql
-- Create Tasks Table
create table tasks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  title text not null,
  time text,
  duration text,
  completed boolean default false,
  type text,
  priority text,
  description text,
  resources jsonb default '[]'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table tasks enable row level security;

-- Create Policies
create policy "Users can see their own tasks" on tasks for select using (auth.uid() = user_id);
create policy "Users can insert their own tasks" on tasks for insert with check (auth.uid() = user_id);
create policy "Users can update their own tasks" on tasks for update using (auth.uid() = user_id);
create policy "Users can delete their own tasks" on tasks for delete using (auth.uid() = user_id);

-- (Optional) Create Schedule and Activities tables similarly
```

## 3. Enable Authentication
In the **Auth** section of Supabase:
1. Ensure **Email/Password** is enabled.
2. Disable "Confirm Email" if you want users to be able to sign up and log in immediately (easier for testing).

## 4. Deploying to the Web
To make this a link others can use:
1. Push your code to a **GitHub** repository.
2. Go to [Vercel](https://vercel.com/) or [Netlify](https://www.netlify.com/).
3. Connect your repository.
4. Add your `.env` variables (**VITE_SUPABASE_URL** and **VITE_SUPABASE_ANON_KEY**) in the "Environment Variables" section of the deployment settings.
5. Deploy! You will get a link like `studr.vercel.app`.
