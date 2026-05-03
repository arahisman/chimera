export type SubscriptionType = "max" | "pro" | "team" | "enterprise"

export type RateLimitTier =
  | "default"
  | "default_claude_max_5x"
  | "default_claude_max_20x"
  | string

export type BillingType =
  | "free"
  | "pro"
  | "max"
  | "team"
  | "enterprise"
  | string

export interface OAuthTokenExchangeResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
  account?: {
    uuid: string
    email_address: string
  }
  organization?: {
    uuid: string
  }
}

export interface OAuthProfileResponse {
  account: {
    uuid: string
    email: string
    email_address?: string
    display_name?: string | null
    created_at?: string
  }
  organization: {
    uuid: string
    name?: string
    organization_type?: string
    rate_limit_tier?: RateLimitTier | null
    has_extra_usage_enabled?: boolean | null
    billing_type?: BillingType | null
    subscription_created_at?: string | null
  }
}

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes?: string[]
  subscriptionType?: SubscriptionType | null
  rateLimitTier?: RateLimitTier | null
  profile?: OAuthProfileResponse
  tokenAccount?: {
    uuid: string
    emailAddress: string
    organizationUuid?: string
  }
}

export interface UserRolesResponse {
  organization_role?: string
  workspace_role?: string
  organization_name?: string
}

export interface ReferrerRewardInfo {
  amount?: number
  currency?: string
  type?: string
}

export interface ReferralRedemptionsResponse {
  redemptions?: unknown[]
  limit?: number
}
