CREATE TABLE IF NOT EXISTS user_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    terms_version TEXT NOT NULL,
    privacy_version TEXT NOT NULL,
    accepted_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_user_consents_created_by ON user_consents(created_by);

ALTER TABLE user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own consents" ON user_consents
    FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Users can insert their own consents" ON user_consents
    FOR INSERT WITH CHECK (auth.uid() = created_by);
