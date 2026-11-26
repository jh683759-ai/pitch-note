export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      coaches: {
        Row: {
          created_at: string;
          display_name: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          display_name: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      event_tags: {
        Row: {
          code: string;
          created_at: string;
          id: number;
          is_active: boolean;
          kind: string;
          label: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          kind: string;
          label: string;
          sort_order?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          id?: never;
          is_active?: boolean;
          kind?: string;
          label?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      goal_event_on_court: {
        Row: {
          event_id: string;
          player_id: string;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          player_id: string;
        };
        Update: {
          event_id?: string;
          player_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_event_on_court_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "goal_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_event_on_court_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_event_tags: {
        Row: {
          event_id: string;
          tag_id: number;
        };
        ComputedFields: never;
        Insert: {
          event_id: string;
          tag_id: number;
        };
        Update: {
          event_id?: string;
          tag_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "goal_event_tags_event_id_fkey";
            columns: ["event_id"];
            isOneToOne: false;
            referencedRelation: "goal_events";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_event_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "event_tags";
            referencedColumns: ["id"];
          },
        ];
      };
      goal_events: {
        Row: {
          created_by: string | null;
          updated_by: string | null;
          assist_id: string | null;
          created_at: string;
          goalkeeper_id: string | null;
          id: string;
          is_own_goal: boolean;
          match_id: string;
          minute: number | null;
          note: string | null;
          period: number | null;
          scorer_id: string | null;
          seq: number;
          side: string;
        };
        ComputedFields: never;
        Insert: {
          created_by?: string | null;
          updated_by?: string | null;
          assist_id?: string | null;
          created_at?: string;
          goalkeeper_id?: string | null;
          id?: string;
          is_own_goal?: boolean;
          match_id: string;
          minute?: number | null;
          note?: string | null;
          period?: number | null;
          scorer_id?: string | null;
          seq: number;
          side: string;
        };
        Update: {
          created_by?: string | null;
          updated_by?: string | null;
          assist_id?: string | null;
          created_at?: string;
          goalkeeper_id?: string | null;
          id?: string;
          is_own_goal?: boolean;
          match_id?: string;
          minute?: number | null;
          note?: string | null;
          period?: number | null;
          scorer_id?: string | null;
          seq?: number;
          side?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_events_assist_id_fkey";
            columns: ["assist_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_events_goalkeeper_id_fkey";
            columns: ["goalkeeper_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_events_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match_summary";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "goal_events_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_events_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "tag_counts";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "goal_events_scorer_id_fkey";
            columns: ["scorer_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      match_attendance: {
        Row: {
          created_at: string;
          match_id: string;
          membership: string;
          note: string | null;
          player_id: string;
          status: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          match_id: string;
          membership: string;
          note?: string | null;
          player_id: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          match_id?: string;
          membership?: string;
          note?: string | null;
          player_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_attendance_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match_summary";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "match_attendance_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_attendance_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "tag_counts";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "match_attendance_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      match_notes: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          kind: string;
          match_id: string;
          player_id: string | null;
          sort_order: number;
          updated_at: string;
          visibility: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          kind: string;
          match_id: string;
          player_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          match_id?: string;
          player_id?: string | null;
          sort_order?: number;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_notes_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "match_summary";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "match_notes_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_notes_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "tag_counts";
            referencedColumns: ["match_id"];
          },
          {
            foreignKeyName: "match_notes_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          id: string;
          kickoff_time: string | null;
          match_type: string;
          media_url: string | null;
          mvp_player_id: string | null;
          opponent: string;
          our_score: number | null;
          played_on: string;
          season_id: string;
          status: string;
          their_score: number | null;
          updated_at: string;
          venue: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          id?: string;
          kickoff_time?: string | null;
          match_type?: string;
          media_url?: string | null;
          mvp_player_id?: string | null;
          opponent: string;
          our_score?: number | null;
          played_on: string;
          season_id: string;
          status?: string;
          their_score?: number | null;
          updated_at?: string;
          venue?: string | null;
        };
        Update: {
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          id?: string;
          kickoff_time?: string | null;
          match_type?: string;
          media_url?: string | null;
          mvp_player_id?: string | null;
          opponent?: string;
          our_score?: number | null;
          played_on?: string;
          season_id?: string;
          status?: string;
          their_score?: number | null;
          updated_at?: string;
          venue?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "matches_mvp_player_id_fkey";
            columns: ["mvp_player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      members: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          display_name: string;
          email: string | null;
          player_id: string | null;
          requested_at: string;
          status: string;
          user_id: string;
          wants: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          display_name: string;
          email?: string | null;
          player_id?: string | null;
          requested_at?: string;
          status?: string;
          user_id: string;
          wants?: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          display_name?: string;
          email?: string | null;
          player_id?: string | null;
          requested_at?: string;
          status?: string;
          user_id?: string;
          wants?: string;
        };
        Relationships: [];
      };
      player_notes: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          kind: string;
          match_id: string;
          player_id: string;
          sort_order: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          kind: string;
          match_id: string;
          player_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          match_id?: string;
          player_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      players: {
        Row: {
          coach_note: string | null;
          created_at: string;
          id: string;
          is_active: boolean;
          jersey_number: number | null;
          joined_on: string | null;
          main_position: string | null;
          membership: string;
          name: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          coach_note?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          jersey_number?: number | null;
          joined_on?: string | null;
          main_position?: string | null;
          membership?: string;
          name: string;
          updated_at?: string;
        };
        Update: {
          coach_note?: string | null;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          jersey_number?: number | null;
          joined_on?: string | null;
          main_position?: string | null;
          membership?: string;
          name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      seasons: {
        Row: {
          created_at: string;
          ends_on: string;
          id: string;
          name: string;
          starts_on: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          ends_on: string;
          id?: string;
          name: string;
          starts_on: string;
        };
        Update: {
          created_at?: string;
          ends_on?: string;
          id?: string;
          name?: string;
          starts_on?: string;
        };
        Relationships: [];
      };
      share_links: {
        Row: {
          created_at: string;
          id: string;
          label: string | null;
          revoked_at: string | null;
          token: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          label?: string | null;
          revoked_at?: string | null;
          token?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          label?: string | null;
          revoked_at?: string | null;
          token?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      lineup_goal_diff: {
        Row: {
          events: number | null;
          goal_diff: number | null;
          goals_against: number | null;
          goals_for: number | null;
          player_ids: string[] | null;
          season_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      match_summary: {
        Row: {
          concedes_logged: number | null;
          events_missing: number | null;
          goals_logged: number | null;
          guests_played: number | null;
          match_id: string;
          opponent: string;
          our_score: number | null;
          played_on: string;
          players_played: number | null;
          result: string | null;
          season_id: string;
          status: string;
          their_score: number | null;
        };
        ComputedFields: never;
        Insert: {
          concedes_logged?: never;
          events_missing?: never;
          goals_logged?: never;
          guests_played?: never;
          match_id?: string | null;
          opponent?: string | null;
          our_score?: number | null;
          played_on?: string | null;
          players_played?: never;
          result?: never;
          season_id?: string | null;
          status?: string | null;
          their_score?: number | null;
        };
        Update: {
          concedes_logged?: never;
          events_missing?: never;
          goals_logged?: never;
          guests_played?: never;
          match_id?: string | null;
          opponent?: string | null;
          our_score?: number | null;
          played_on?: string | null;
          players_played?: never;
          result?: never;
          season_id?: string | null;
          status?: string | null;
          their_score?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      pair_goal_diff: {
        Row: {
          events: number | null;
          goal_diff: number | null;
          goals_against: number | null;
          goals_for: number | null;
          player_a: string;
          player_b: string;
          season_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      player_match_log: {
        Row: {
          assists: number | null;
          conceded_as_gk: number | null;
          goals: number | null;
          match_id: string;
          membership: string;
          on_court_against: number | null;
          on_court_for: number | null;
          opponent: string;
          played_on: string;
          player_id: string;
          season_id: string;
          status: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      player_on_court_stats: {
        Row: {
          events: number | null;
          name: string;
          on_court_against: number | null;
          on_court_diff: number | null;
          on_court_for: number | null;
          player_id: string;
          season_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      player_season_stats: {
        Row: {
          appearances: number | null;
          assists: number | null;
          attack_points: number | null;
          attendance_rate: number | null;
          attended: number | null;
          goals: number | null;
          membership: string;
          name: string;
          player_id: string;
          regular_matches: number | null;
          season_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "match_attendance_player_id_fkey";
            columns: ["player_id"];
            isOneToOne: false;
            referencedRelation: "players";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
      tag_counts: {
        Row: {
          code: string;
          events: number | null;
          kind: string;
          label: string;
          match_id: string;
          played_on: string;
          season_id: string;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "matches_season_id_fkey";
            columns: ["season_id"];
            isOneToOne: false;
            referencedRelation: "seasons";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      ensure_season_for: { Args: { p_date: string }; Returns: string };
      is_coach: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_recorder: { Args: Record<PropertyKey, never>; Returns: boolean };
      my_role: { Args: Record<PropertyKey, never>; Returns: string };
      my_player_id: { Args: Record<PropertyKey, never>; Returns: string };
      my_page: { Args: Record<PropertyKey, never>; Returns: Json };
      my_match: { Args: { p_match_id: string }; Returns: Json };
      save_my_notes: { Args: { p_match_id: string; p_notes: Json }; Returns: number };
      staff_names: { Args: Record<PropertyKey, never>; Returns: { display_name: string; user_id: string }[] };
      previous_attendance: {
        Args: { p_match_id: string };
        Returns: {
          player_id: string;
          source_match_id: string;
          source_opponent: string;
          source_played_on: string;
          status: string;
        }[];
      };
      save_goal_event: {
        Args: {
          p_assist_id?: string | null;
          p_event_id?: string | null;
          p_goalkeeper_id?: string | null;
          p_is_own_goal?: boolean;
          p_match_id: string;
          p_note?: string | null;
          p_on_court?: string[];
          p_scorer_id?: string | null;
          p_side: string;
          p_tag_ids?: number[];
        };
        Returns: string;
      };
      save_match_review: {
        Args: { p_match_id: string; p_notes: Json; p_mvp_player_id?: string | null };
        Returns: number;
      };
      set_attendance: { Args: { p_match_id: string; p_rows: Json }; Returns: number };
      shared_match: { Args: { p_token: string; p_match_id: string }; Returns: Json };
      shared_overview: { Args: { p_token: string }; Returns: Json };
      shared_player: { Args: { p_token: string; p_player_id: string }; Returns: Json };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
