-- Migration: 20261119213000_bemo_expanded_categories.sql
-- Idempotent seeding and management for BEMO's 20 primary categories and dynamic subcategories

CREATE TABLE IF NOT EXISTS public.bemo_categories (
    id TEXT PRIMARY KEY,
    parent_id TEXT REFERENCES public.bemo_categories(id) ON DELETE RESTRICT,
    slug TEXT NOT NULL UNIQUE,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    icon_svg TEXT,
    description TEXT,
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bemo_categories_parent ON public.bemo_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_bemo_categories_slug ON public.bemo_categories(slug);

-- Enable RLS
ALTER TABLE public.bemo_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public categories read" ON public.bemo_categories
    FOR SELECT USING (is_active = TRUE);

-- RPC for public category tree
CREATE OR REPLACE FUNCTION public.bemo_list_category_tree()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'slug', c.slug,
                'name_ar', c.name_ar,
                'name_en', c.name_en,
                'icon_svg', c.icon_svg,
                'sort_order', c.sort_order,
                'subcategories', (
                    SELECT COALESCE(
                        jsonb_agg(
                            jsonb_build_object(
                                'id', s.id,
                                'slug', s.slug,
                                'name_ar', s.name_ar,
                                'name_en', s.name_en,
                                'sort_order', s.sort_order
                            ) ORDER BY s.sort_order ASC, s.name_en ASC
                        ), '[]'::jsonb
                    )
                    FROM public.bemo_categories s
                    WHERE s.parent_id = c.id AND s.is_active = TRUE
                )
            ) ORDER BY c.sort_order ASC, c.name_en ASC
        ), '[]'::jsonb
    )
    FROM public.bemo_categories c
    WHERE c.parent_id IS NULL AND c.is_active = TRUE;
$$;
