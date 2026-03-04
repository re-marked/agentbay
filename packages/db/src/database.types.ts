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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      agent_instances: {
        Row: {
          agent_id: string
          config: Json | null
          created_at: string
          display_name: string | null
          error_message: string | null
          fly_app_name: string
          fly_machine_id: string
          fly_volume_id: string | null
          gateway_token: string | null
          id: string
          last_active_at: string | null
          model_preference: string | null
          region: string
          status: string
          team_id: string | null
          updated_at: string
          user_id: string
          workspace_files: Json | null
        }
        Insert: {
          agent_id: string
          config?: Json | null
          created_at?: string
          display_name?: string | null
          error_message?: string | null
          fly_app_name: string
          fly_machine_id: string
          fly_volume_id?: string | null
          gateway_token?: string | null
          id?: string
          last_active_at?: string | null
          model_preference?: string | null
          region?: string
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id: string
          workspace_files?: Json | null
        }
        Update: {
          agent_id?: string
          config?: Json | null
          created_at?: string
          display_name?: string | null
          error_message?: string | null
          fly_app_name?: string
          fly_machine_id?: string
          fly_volume_id?: string | null
          gateway_token?: string | null
          id?: string
          last_active_at?: string | null
          model_preference?: string | null
          region?: string
          status?: string
          team_id?: string | null
          updated_at?: string
          user_id?: string
          workspace_files?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_instances_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_instances_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_instances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_reviews: {
        Row: {
          agent_id: string
          content: string | null
          created_at: string
          id: string
          rating: number
          user_id: string
        }
        Insert: {
          agent_id: string
          content?: string | null
          created_at?: string
          id?: string
          rating: number
          user_id: string
        }
        Update: {
          agent_id?: string
          content?: string | null
          created_at?: string
          id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_reviews_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_skills: {
        Row: {
          agent_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          permissions: string[] | null
          skill_content: string
          slug: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          permissions?: string[] | null
          skill_content: string
          slug: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          permissions?: string[] | null
          skill_content?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_skills_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_versions: {
        Row: {
          agent_id: string
          changelog: string | null
          created_at: string
          docker_image: string
          id: string
          version: string
        }
        Insert: {
          agent_id: string
          changelog?: string | null
          created_at?: string
          docker_image: string
          id?: string
          version: string
        }
        Update: {
          agent_id?: string
          changelog?: string | null
          created_at?: string
          docker_image?: string
          id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          avg_rating: number | null
          category: string
          created_at: string
          creator_id: string
          credits_per_session: number | null
          description: string
          docker_image: string | null
          fly_machine_memory_mb: number
          fly_machine_size: string
          github_repo_url: string
          icon_url: string | null
          id: string
          name: string
          openclaw_version: string | null
          pricing_model: string
          published_at: string | null
          slug: string
          status: string
          supported_models: string[] | null
          supported_relays: string[] | null
          tagline: string
          tags: string[] | null
          total_hires: number
          total_reviews: number
          updated_at: string
        }
        Insert: {
          avg_rating?: number | null
          category: string
          created_at?: string
          creator_id: string
          credits_per_session?: number | null
          description: string
          docker_image?: string | null
          fly_machine_memory_mb?: number
          fly_machine_size?: string
          github_repo_url: string
          icon_url?: string | null
          id?: string
          name: string
          openclaw_version?: string | null
          pricing_model?: string
          published_at?: string | null
          slug: string
          status?: string
          supported_models?: string[] | null
          supported_relays?: string[] | null
          tagline: string
          tags?: string[] | null
          total_hires?: number
          total_reviews?: number
          updated_at?: string
        }
        Update: {
          avg_rating?: number | null
          category?: string
          created_at?: string
          creator_id?: string
          credits_per_session?: number | null
          description?: string
          docker_image?: string | null
          fly_machine_memory_mb?: number
          fly_machine_size?: string
          github_repo_url?: string
          icon_url?: string | null
          id?: string
          name?: string
          openclaw_version?: string | null
          pricing_model?: string
          published_at?: string | null
          slug?: string
          status?: string
          supported_models?: string[] | null
          supported_relays?: string[] | null
          tagline?: string
          tags?: string[] | null
          total_hires?: number
          total_reviews?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          member_id: string
          role: string
        }
        Insert: {
          channel_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          member_id: string
          role?: string
        }
        Update: {
          channel_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          member_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string
          deleted_at: string | null
          depth: number
          edited_at: string | null
          id: string
          mentions: string[]
          message_kind: string
          metadata: Json
          origin_id: string | null
          parent_id: string | null
          sender_id: string
        }
        Insert: {
          channel_id: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          depth?: number
          edited_at?: string | null
          id?: string
          mentions?: string[]
          message_kind?: string
          metadata?: Json
          origin_id?: string | null
          parent_id?: string | null
          sender_id: string
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          depth?: number
          edited_at?: string | null
          id?: string
          mentions?: string[]
          message_kind?: string
          metadata?: Json
          origin_id?: string | null
          parent_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          archived: boolean
          created_at: string
          description: string | null
          id: string
          kind: string
          name: string
          pinned: boolean
          project_id: string
          team_id: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name: string
          pinned?: boolean
          project_id: string
          team_id?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          name?: string
          pinned?: boolean
          project_id?: string
          team_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channels_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_agents: {
        Row: {
          added_at: string
          chat_id: string
          id: string
          instance_id: string
        }
        Insert: {
          added_at?: string
          chat_id: string
          id?: string
          instance_id: string
        }
        Update: {
          added_at?: string
          chat_id?: string
          id?: string
          instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_agents_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_agents_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string
          id: string
          name: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_earnings: {
        Row: {
          agent_id: string
          compute_cost: number
          created_at: string
          creator_amount: number
          creator_id: string
          creator_rate: number
          gross_revenue: number
          id: string
          paid_out: boolean
          paid_out_at: string | null
          platform_amount: number
          session_id: string | null
          stripe_transfer_id: string | null
        }
        Insert: {
          agent_id: string
          compute_cost: number
          created_at?: string
          creator_amount: number
          creator_id: string
          creator_rate?: number
          gross_revenue: number
          id?: string
          paid_out?: boolean
          paid_out_at?: string | null
          platform_amount: number
          session_id?: string | null
          stripe_transfer_id?: string | null
        }
        Update: {
          agent_id?: string
          compute_cost?: number
          created_at?: string
          creator_amount?: number
          creator_id?: string
          creator_rate?: number
          gross_revenue?: number
          id?: string
          paid_out?: boolean
          paid_out_at?: string | null
          platform_amount?: number
          session_id?: string | null
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "creator_earnings_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_earnings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_balances: {
        Row: {
          id: string
          subscription_credits: number
          topup_credits: number
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          subscription_credits?: number
          topup_credits?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          subscription_credits?: number
          topup_credits?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_balances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          credit_type: string
          description: string | null
          id: string
          session_id: string | null
          stripe_payment_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credit_type: string
          description?: string | null
          id?: string
          session_id?: string | null
          stripe_payment_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_type?: string
          description?: string | null
          id?: string
          session_id?: string | null
          stripe_payment_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      externals: {
        Row: {
          config: Json
          created_at: string
          external_id: string
          external_name: string | null
          id: string
          last_synced_at: string | null
          member_id: string
          project_id: string
          service: string
          status: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          external_id: string
          external_name?: string | null
          id?: string
          last_synced_at?: string | null
          member_id: string
          project_id: string
          service: string
          status?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          external_id?: string
          external_name?: string | null
          id?: string
          last_synced_at?: string | null
          member_id?: string
          project_id?: string
          service?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "externals_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "externals_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      instance_skills: {
        Row: {
          id: string
          installed_at: string
          instance_id: string
          skill_id: string
        }
        Insert: {
          id?: string
          installed_at?: string
          instance_id: string
          skill_id: string
        }
        Update: {
          id?: string
          installed_at?: string
          instance_id?: string
          skill_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "instance_skills_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instance_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          color: string | null
          created_at: string
          display_name: string
          ephemeral: boolean
          id: string
          instance_id: string | null
          metadata: Json
          project_id: string
          rank: string
          spawned_by: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          display_name: string
          ephemeral?: boolean
          id?: string
          instance_id?: string | null
          metadata?: Json
          project_id: string
          rank?: string
          spawned_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          display_name?: string
          ephemeral?: boolean
          id?: string
          instance_id?: string | null
          metadata?: Json
          project_id?: string
          rank?: string
          spawned_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "members_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_spawned_by_fkey"
            columns: ["spawned_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
          tokens_used: number
          tool_use: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          session_id: string
          tokens_used?: number
          tool_use?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          session_id?: string
          tokens_used?: number
          tool_use?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          master_member_id: string | null
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          master_member_id?: string | null
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          master_member_id?: string | null
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_master_member_id_fkey"
            columns: ["master_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      publish_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: []
      }
      relay_connections: {
        Row: {
          config: Json | null
          created_at: string
          external_chat_id: string | null
          external_user_id: string
          id: string
          instance_id: string
          relay: string
          status: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          external_chat_id?: string | null
          external_user_id: string
          id?: string
          instance_id: string
          relay: string
          status?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          external_chat_id?: string | null
          external_user_id?: string
          id?: string
          instance_id?: string
          relay?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "relay_connections_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          compute_seconds: number
          ended_at: string | null
          id: string
          instance_id: string
          relay: string
          started_at: string
          total_credits_consumed: number
          total_input_tokens: number
          total_output_tokens: number
          user_id: string
        }
        Insert: {
          compute_seconds?: number
          ended_at?: string | null
          id?: string
          instance_id: string
          relay?: string
          started_at?: string
          total_credits_consumed?: number
          total_input_tokens?: number
          total_output_tokens?: number
          user_id: string
        }
        Update: {
          compute_seconds?: number
          ended_at?: string | null
          id?: string
          instance_id?: string
          relay?: string
          started_at?: string
          total_credits_consumed?: number
          total_input_tokens?: number
          total_output_tokens?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          author: string | null
          category: string
          created_at: string
          description: string
          emoji: string | null
          homepage: string | null
          id: string
          name: string
          requires: Json | null
          skill_content: string
          slug: string
          source: string
          status: string
          tags: string[] | null
          total_installs: number
          updated_at: string
          version: string
        }
        Insert: {
          author?: string | null
          category?: string
          created_at?: string
          description: string
          emoji?: string | null
          homepage?: string | null
          id?: string
          name: string
          requires?: Json | null
          skill_content: string
          slug: string
          source?: string
          status?: string
          tags?: string[] | null
          total_installs?: number
          updated_at?: string
          version?: string
        }
        Update: {
          author?: string | null
          category?: string
          created_at?: string
          description?: string
          emoji?: string | null
          homepage?: string | null
          id?: string
          name?: string
          requires?: Json | null
          skill_content?: string
          slug?: string
          source?: string
          status?: string
          tags?: string[] | null
          total_installs?: number
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          assigned_to: string | null
          channel_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_at: string | null
          id: string
          metadata: Json
          parent_task_id: string | null
          priority: string
          project_id: string
          result: Json | null
          started_at: string | null
          status: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          parent_task_id?: string | null
          priority?: string
          project_id: string
          result?: Json | null
          started_at?: string | null
          status?: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          channel_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          parent_task_id?: string | null
          priority?: string
          project_id?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_agents: {
        Row: {
          created_at: string
          id: string
          instance_id: string
          team_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_id: string
          team_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_agents_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_agents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          id: string
          joined_at: string
          member_id: string
          role: string
          team_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          member_id: string
          role?: string
          team_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          member_id?: string
          role?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          description: string | null
          id: string
          leader_member_id: string | null
          name: string
          parent_id: string | null
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          leader_member_id?: string | null
          name: string
          parent_id?: string | null
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          leader_member_id?: string | null
          name?: string
          parent_id?: string | null
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_leader_member_id_fkey"
            columns: ["leader_member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_events: {
        Row: {
          compute_seconds: number
          cost_usd: number
          created_at: string
          credits_consumed: number
          id: string
          input_tokens: number
          instance_id: string
          output_tokens: number
          session_id: string | null
          user_id: string
        }
        Insert: {
          compute_seconds?: number
          cost_usd?: number
          created_at?: string
          credits_consumed?: number
          id?: string
          input_tokens?: number
          instance_id: string
          output_tokens?: number
          session_id?: string | null
          user_id: string
        }
        Update: {
          compute_seconds?: number
          cost_usd?: number
          created_at?: string
          credits_consumed?: number
          id?: string
          input_tokens?: number
          instance_id?: string
          output_tokens?: number
          session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_events_instance_id_fkey"
            columns: ["instance_id"]
            isOneToOne: false
            referencedRelation: "agent_instances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usage_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          provider: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          provider: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          provider?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_model: string
          display_name: string | null
          email: string
          id: string
          role: string
          stripe_connect_account_id: string | null
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_model?: string
          display_name?: string | null
          email: string
          id: string
          role?: string
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_model?: string
          display_name?: string | null
          email?: string
          id?: string
          role?: string
          stripe_connect_account_id?: string | null
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      waitlist: {
        Row: {
          created_at: string
          email: string
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      record_usage_event: {
        Args: {
          p_compute_seconds: number
          p_cost_usd: number
          p_credits_consumed: number
          p_input_tokens: number
          p_instance_id: string
          p_output_tokens: number
          p_session_id: string
          p_user_id: string
        }
        Returns: string
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
    Enums: {},
  },
} as const
