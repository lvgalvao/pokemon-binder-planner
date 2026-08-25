/**
 * GERADO. Nao editar a mao.
 *
 * Regerar depois de qualquer migracao:
 *   supabase gen types typescript --project-id kuhhbncqurtwucylhsmq > lib/database.types.ts
 *
 * E o que faz supabase.from("owned_card") saber que a coluna se chama card_id, e
 * o que impediu o retorno de owned_count_by_set() de chegar como `any`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      binder: {
        Row: {
          columns: number
          created_at: string
          rows: number
          set_id: string
          sort_rule: string
          user_id: string
        }
        Insert: {
          columns?: number
          created_at?: string
          rows?: number
          set_id: string
          sort_rule?: string
          user_id: string
        }
        Update: {
          columns?: number
          created_at?: string
          rows?: number
          set_id?: string
          sort_rule?: string
          user_id?: string
        }
        Relationships: []
      }
      binder_group: {
        Row: {
          columns: number
          created_at: string
          id: string
          nome: string
          rows: number
          set_ids: string[]
          sort_rule: string
          user_id: string
        }
        Insert: {
          columns?: number
          created_at?: string
          id?: string
          nome: string
          rows?: number
          set_ids: string[]
          sort_rule?: string
          user_id: string
        }
        Update: {
          columns?: number
          created_at?: string
          id?: string
          nome?: string
          rows?: number
          set_ids?: string[]
          sort_rule?: string
          user_id?: string
        }
        Relationships: []
      }
      owned_card: {
        Row: {
          card_id: string
          set_id: string
          user_id: string
        }
        Insert: {
          card_id: string
          set_id: string
          user_id: string
        }
        Update: {
          card_id?: string
          set_id?: string
          user_id?: string
        }
        Relationships: []
      }
      starred_card: {
        Row: {
          card_id: string
          set_id: string
          user_id: string
        }
        Insert: {
          card_id: string
          set_id: string
          user_id: string
        }
        Update: {
          card_id?: string
          set_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owned_count_by_set: {
        Args: never
        Returns: {
          n: number
          set_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
