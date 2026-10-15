
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "events": {
                  Row: {
                    "all_day": boolean,"created_at": string,"details": string | null,"ends_at": string | null,"id": string,"location": string | null,"remind_at": string | null,"reminded_at": string | null,"starts_at": string,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "all_day"?: boolean,"created_at"?: string,"details"?: string | null,"ends_at"?: string | null,"id"?: string,"location"?: string | null,"remind_at"?: string | null,"reminded_at"?: string | null,"starts_at": string,"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "all_day"?: boolean,"created_at"?: string,"details"?: string | null,"ends_at"?: string | null,"id"?: string,"location"?: string | null,"remind_at"?: string | null,"reminded_at"?: string | null,"starts_at"?: string,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"notes": {
                  Row: {
                    "content": Json | null,"content_text": string,"created_at": string,"id": string,"pinned": boolean,"project_id": string | null,"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "content"?: Json | null,"content_text"?: string,"created_at"?: string,"id"?: string,"pinned"?: boolean,"project_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "content"?: Json | null,"content_text"?: string,"created_at"?: string,"id"?: string,"pinned"?: boolean,"project_id"?: string | null,"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","user_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"digest_enabled": boolean,"digest_time": string,"display_name": string | null,"id": string,"timezone": string,"weekly_day": number,"weekly_enabled": boolean,"weekly_time": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"digest_enabled"?: boolean,"digest_time"?: string,"display_name"?: string | null,"id": string,"timezone"?: string,"weekly_day"?: number,"weekly_enabled"?: boolean,"weekly_time"?: string
                  }
                  Update: {
                    "created_at"?: string,"digest_enabled"?: boolean,"digest_time"?: string,"display_name"?: string | null,"id"?: string,"timezone"?: string,"weekly_day"?: number,"weekly_enabled"?: boolean,"weekly_time"?: string
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "archived": boolean,"created_at": string,"id": string,"name": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"created_at"?: string,"id"?: string,"name": string,"user_id"?: string
                  }
                  Update: {
                    "archived"?: boolean,"created_at"?: string,"id"?: string,"name"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"quick_links": {
                  Row: {
                    "created_at": string,"id": string,"label": string,"position": number,"url": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"label": string,"position"?: number,"url": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"label"?: string,"position"?: number,"url"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"tasks": {
                  Row: {
                    "completed_at": string | null,"created_at": string,"due_at": string | null,"id": string,"links": NonNullable<Json>,"notes": Json | null,"notes_text": string,"priority": Database["public"]['Enums']["task_priority"],"project_id": string | null,"remind_at": string | null,"reminded_at": string | null,"show_on_calendar": boolean,"status": Database["public"]['Enums']["task_status"],"title": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "completed_at"?: string | null,"created_at"?: string,"due_at"?: string | null,"id"?: string,"links"?: NonNullable<Json>,"notes"?: Json | null,"notes_text"?: string,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string | null,"remind_at"?: string | null,"reminded_at"?: string | null,"show_on_calendar"?: boolean,"status"?: Database["public"]['Enums']["task_status"],"title": string,"updated_at"?: string,"user_id"?: string
                  }
                  Update: {
                    "completed_at"?: string | null,"created_at"?: string,"due_at"?: string | null,"id"?: string,"links"?: NonNullable<Json>,"notes"?: Json | null,"notes_text"?: string,"priority"?: Database["public"]['Enums']["task_priority"],"project_id"?: string | null,"remind_at"?: string | null,"reminded_at"?: string | null,"show_on_calendar"?: boolean,"status"?: Database["public"]['Enums']["task_status"],"title"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_project_id_user_id_fkey"
      columns: ["project_id","user_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","user_id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            [_ in never]: never
          }
          Enums: {
            "task_priority": "urgent"|"high"|"medium"|"low","task_status": "todo"|"in_progress"|"waiting"|"done"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "task_priority": ["urgent", "high", "medium", "low"],"task_status": ["todo", "in_progress", "waiting", "done"]
          }
        }
} as const
