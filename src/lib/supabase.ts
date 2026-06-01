import { createClient } from '@supabase/supabase-js';
import { auth } from '../firebase';

function getSupabaseUrl(): string {
  const url = process.env.SUPABASE_URL;
  if (!url) throw new Error('SUPABASE_URL not configured');
  return url;
}

function getSupabaseKey(): string {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('SUPABASE_PUBLISHABLE_KEY not configured');
  return key;
}

export const supabase = createClient(getSupabaseUrl(), getSupabaseKey());

export async function saveToolResult(userId: string, toolName: string, content: any, fileType: string) {
  const { data, error } = await supabase
    .from('tool_outputs')
    .insert({
      user_id: userId,
      tool_name: toolName,
      content: typeof content === 'string' ? content : JSON.stringify(content),
      file_type: fileType,
    })
    .select('id')
    .single();

  if (error) handleDbError(error, 'tool_outputs', 'insert');
  return data?.id;
}

export async function fetchToolResult(id: string) {
  const { data, error } = await supabase
    .from('tool_outputs')
    .select('content, file_type, tool_name')
    .eq('id', id)
    .single();

  if (error) handleDbError(error, 'tool_outputs', 'select');
  return data;
}

export interface DbErrorInfo {
  error: string;
  table: string | null;
  operation: string;
  authInfo: {
    userId?: string | null;
    email?: string | null;
  };
}

export function handleDbError(error: unknown, table: string | null, operation: string): never {
  const errInfo: DbErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    table,
    operation,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
  };
  console.error('Supabase Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
