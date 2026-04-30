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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      report_verifications: {
        Row: {
          created_at: string
          id: string
          is_true: boolean
          kind: Database["public"]["Enums"]["verification_kind"]
          report_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_true: boolean
          kind?: Database["public"]["Enums"]["verification_kind"]
          report_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_true?: boolean
          kind?: Database["public"]["Enums"]["verification_kind"]
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_verifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_verifications_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports_public"
            referencedColumns: ["id"]
          },
        ]
      }
      report_votes: {
        Row: {
          created_at: string
          id: string
          report_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          report_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          report_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_votes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_votes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports_public"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: Database["public"]["Enums"]["report_category"]
          created_at: string
          description: string
          false_count: number
          id: string
          latitude: number
          longitude: number
          persistent_count: number
          photo_url: string | null
          resolved_community_count: number
          status: Database["public"]["Enums"]["report_status"]
          true_count: number
          updated_at: string
          user_id: string
          verified_status: Database["public"]["Enums"]["verification_status"]
          ville: string | null
          votes_count: number
        }
        Insert: {
          category: Database["public"]["Enums"]["report_category"]
          created_at?: string
          description: string
          false_count?: number
          id?: string
          latitude: number
          longitude: number
          persistent_count?: number
          photo_url?: string | null
          resolved_community_count?: number
          status?: Database["public"]["Enums"]["report_status"]
          true_count?: number
          updated_at?: string
          user_id: string
          verified_status?: Database["public"]["Enums"]["verification_status"]
          ville?: string | null
          votes_count?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"]
          created_at?: string
          description?: string
          false_count?: number
          id?: string
          latitude?: number
          longitude?: number
          persistent_count?: number
          photo_url?: string | null
          resolved_community_count?: number
          status?: Database["public"]["Enums"]["report_status"]
          true_count?: number
          updated_at?: string
          user_id?: string
          verified_status?: Database["public"]["Enums"]["verification_status"]
          ville?: string | null
          votes_count?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      reports_public: {
        Row: {
          category: Database["public"]["Enums"]["report_category"] | null
          created_at: string | null
          description: string | null
          false_count: number | null
          id: string | null
          latitude: number | null
          longitude: number | null
          persistent_count: number | null
          photo_url: string | null
          resolved_community_count: number | null
          status: Database["public"]["Enums"]["report_status"] | null
          true_count: number | null
          updated_at: string | null
          verified_status:
            | Database["public"]["Enums"]["verification_status"]
            | null
          ville: string | null
          votes_count: number | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["report_category"] | null
          created_at?: string | null
          description?: string | null
          false_count?: number | null
          id?: string | null
          latitude?: never
          longitude?: never
          persistent_count?: number | null
          photo_url?: string | null
          resolved_community_count?: number | null
          status?: Database["public"]["Enums"]["report_status"] | null
          true_count?: number | null
          updated_at?: string | null
          verified_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          ville?: string | null
          votes_count?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["report_category"] | null
          created_at?: string | null
          description?: string | null
          false_count?: number | null
          id?: string | null
          latitude?: never
          longitude?: never
          persistent_count?: number | null
          photo_url?: string | null
          resolved_community_count?: number | null
          status?: Database["public"]["Enums"]["report_status"] | null
          true_count?: number | null
          updated_at?: string | null
          verified_status?:
            | Database["public"]["Enums"]["verification_status"]
            | null
          ville?: string | null
          votes_count?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "citoyen" | "autorite" | "admin"
      report_category:
        | "dechets"
        | "eaux_usees"
        | "voirie"
        | "marche"
        | "eau_stagnante"
        | "autre"
        | "chantier_peril"
        | "chantier_signalisation"
        | "emprise_chaussee"
        | "chantier_ecoulement"
        | "fuite_sodeci"
      report_status: "nouveau" | "en_cours" | "resolu" | "rejete"
      verification_kind: "veracite" | "persistance"
      verification_status: "en_attente" | "valide" | "rejete" | "douteux"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
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
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["citoyen", "autorite", "admin"],
      report_category: [
        "dechets",
        "eaux_usees",
        "voirie",
        "marche",
        "eau_stagnante",
        "autre",
        "chantier_peril",
        "chantier_signalisation",
        "emprise_chaussee",
        "chantier_ecoulement",
        "fuite_sodeci",
      ],
      report_status: ["nouveau", "en_cours", "resolu", "rejete"],
      verification_kind: ["veracite", "persistance"],
      verification_status: ["en_attente", "valide", "rejete", "douteux"],
    },
  },
} as const
