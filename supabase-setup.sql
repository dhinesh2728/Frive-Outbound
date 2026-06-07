-- ============================================================
-- Frive Outbound – Custom Auth + Permission Groups
-- Run this ONCE in Supabase Dashboard → SQL Editor
-- ============================================================

-- NOTE: Passwords stored as plain text (internal ops tool only).

-- ============================================================
-- 1. TABLES
-- ============================================================

-- Permission groups (e.g. "Warehouse Team", "Managers")
CREATE TABLE IF NOT EXISTS public.permission_groups (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL UNIQUE,
  permissions JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- App users (custom auth – NOT Supabase Auth users)
CREATE TABLE IF NOT EXISTS public.app_users (
  id                   UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  username             TEXT        NOT NULL UNIQUE,
  password_hash        TEXT        NOT NULL,
  permission_group_id  UUID        REFERENCES public.permission_groups(id) ON DELETE SET NULL,
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  is_superadmin        BOOLEAN     NOT NULL DEFAULT false,
  last_login           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 2. ROW LEVEL SECURITY
-- ============================================================

-- app_users: deny ALL direct access (passwords stored in this table)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
-- No policies added → anon/authenticated cannot read/write directly

-- permission_groups: allow anon SELECT (no sensitive data), writes via RPC only
ALTER TABLE public.permission_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can read permission_groups" ON public.permission_groups;
CREATE POLICY "Anyone can read permission_groups"
  ON public.permission_groups FOR SELECT USING (true);
-- No write policies → only SECURITY DEFINER functions can write

-- ============================================================
-- 3. RPC FUNCTIONS (all SECURITY DEFINER to bypass RLS)
-- ============================================================

-- 3a. authenticate_user
--     Returns user data + permissions on success, NULL on failure
DROP FUNCTION IF EXISTS public.authenticate_user(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.authenticate_user(p_username TEXT, p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user  public.app_users%ROWTYPE;
  v_group public.permission_groups%ROWTYPE;
BEGIN
  SELECT * INTO v_user
  FROM public.app_users
  WHERE lower(username) = lower(p_username) AND is_active = true;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Plain-text password comparison
  IF v_user.password_hash IS DISTINCT FROM p_password THEN
    RETURN NULL;
  END IF;

  -- Record login time
  UPDATE public.app_users SET last_login = now() WHERE id = v_user.id;

  -- Fetch permission group
  IF v_user.permission_group_id IS NOT NULL THEN
    SELECT * INTO v_group FROM public.permission_groups WHERE id = v_user.permission_group_id;
  END IF;

  RETURN json_build_object(
    'id',                  v_user.id,
    'username',            v_user.username,
    'is_superadmin',       v_user.is_superadmin,
    'permission_group_id', v_user.permission_group_id,
    'group_name',          v_group.name,
    'permissions',         COALESCE(v_group.permissions, '{}'::jsonb)
  );
END;
$$;

-- 3b. get_app_users – safe read (no password_hash)
DROP FUNCTION IF EXISTS public.get_app_users();
CREATE OR REPLACE FUNCTION public.get_app_users()
RETURNS JSON
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT json_agg(row_to_json(t) ORDER BY t.is_superadmin DESC, t.created_at ASC)
  FROM (
    SELECT
      u.id, u.username, u.permission_group_id,
      u.is_active, u.is_superadmin, u.last_login, u.created_at,
      pg.name AS group_name
    FROM public.app_users u
    LEFT JOIN public.permission_groups pg ON pg.id = u.permission_group_id
  ) t;
$$;

-- 3c. create_app_user
DROP FUNCTION IF EXISTS public.create_app_user(TEXT, TEXT, UUID);
CREATE OR REPLACE FUNCTION public.create_app_user(
  p_username TEXT,
  p_password TEXT,
  p_group_id UUID
)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_new public.app_users%ROWTYPE;
BEGIN
  INSERT INTO public.app_users (username, password_hash, permission_group_id)
  VALUES (lower(trim(p_username)), p_password, p_group_id)
  RETURNING * INTO v_new;

  RETURN json_build_object(
    'id',                  v_new.id,
    'username',            v_new.username,
    'permission_group_id', v_new.permission_group_id,
    'is_active',           v_new.is_active,
    'is_superadmin',       v_new.is_superadmin,
    'last_login',          v_new.last_login,
    'created_at',          v_new.created_at
  );
END;
$$;

-- 3d. update_app_user_password
DROP FUNCTION IF EXISTS public.update_app_user_password(UUID, TEXT);
CREATE OR REPLACE FUNCTION public.update_app_user_password(p_user_id UUID, p_new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.app_users
  SET password_hash = p_new_password
  WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;

-- 3e. update_app_user_group
DROP FUNCTION IF EXISTS public.update_app_user_group(UUID, UUID);
CREATE OR REPLACE FUNCTION public.update_app_user_group(p_user_id UUID, p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.app_users
  SET permission_group_id = p_group_id
  WHERE id = p_user_id AND is_superadmin = false;
  RETURN FOUND;
END;
$$;

-- 3f. set_app_user_active (cannot deactivate superadmin)
DROP FUNCTION IF EXISTS public.set_app_user_active(UUID, BOOLEAN);
CREATE OR REPLACE FUNCTION public.set_app_user_active(p_user_id UUID, p_active BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.app_users
  SET is_active = p_active
  WHERE id = p_user_id AND is_superadmin = false;
  RETURN FOUND;
END;
$$;

-- 3g. create_permission_group
DROP FUNCTION IF EXISTS public.create_permission_group(TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.create_permission_group(p_name TEXT, p_permissions JSONB)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_new public.permission_groups%ROWTYPE;
BEGIN
  INSERT INTO public.permission_groups (name, permissions)
  VALUES (trim(p_name), p_permissions)
  RETURNING * INTO v_new;
  RETURN row_to_json(v_new);
END;
$$;

-- 3h. update_permission_group
DROP FUNCTION IF EXISTS public.update_permission_group(UUID, TEXT, JSONB);
CREATE OR REPLACE FUNCTION public.update_permission_group(p_id UUID, p_name TEXT, p_permissions JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public.permission_groups
  SET name = trim(p_name), permissions = p_permissions
  WHERE id = p_id;
  RETURN FOUND;
END;
$$;

-- 3i. delete_permission_group (blocks if users are assigned)
DROP FUNCTION IF EXISTS public.delete_permission_group(UUID);
CREATE OR REPLACE FUNCTION public.delete_permission_group(p_id UUID)
RETURNS JSON
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.app_users WHERE permission_group_id = p_id;
  IF v_count > 0 THEN
    RETURN json_build_object('success', false, 'error',
      'Cannot delete: ' || v_count || ' user(s) are assigned to this group.');
  END IF;
  DELETE FROM public.permission_groups WHERE id = p_id;
  RETURN json_build_object('success', true);
END;
$$;

-- ============================================================
-- 4. SEED DATA
-- ============================================================

-- Default "Full Access" permission group for the superadmin
INSERT INTO public.permission_groups (id, name, permissions)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Full Access',
  '{
    "meal_counting":  true,
    "palletization":  true,
    "outbound":       true,
    "csv_import":     true,
    "crate_settings": true,
    "set_cook_date":  true,
    "cook_date_rules":true,
    "outbound_admin": true,
    "reports":        true
  }'::jsonb
)
ON CONFLICT (id) DO NOTHING;

-- Hardcoded superadmin: username = admin, password = Frive2024!
-- This account cannot be deactivated or deleted via the UI.
INSERT INTO public.app_users (username, password_hash, permission_group_id, is_superadmin, is_active)
VALUES (
  'admin',
  'Frive2024!',
  '00000000-0000-0000-0000-000000000001',
  true,
  true
)
ON CONFLICT (username) DO NOTHING;
