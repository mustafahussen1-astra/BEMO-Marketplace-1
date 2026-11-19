-- Migration: 20261119231500_bemo_disputes_and_reports.sql
-- Create customer disputes, complaints, and admin dispute review workflow

CREATE TABLE IF NOT EXISTS public.bemo_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES bemo_private.orders(id) ON DELETE CASCADE,
    store_id UUID REFERENCES bemo_private.stores(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES bemo_private.app_users(id),
    category TEXT NOT NULL CHECK(category IN ('ITEM_MISMATCH', 'DELAYED_DELIVERY', 'DAMAGED_ITEM', 'SELLER_CONDUCT', 'OTHER')),
    subject TEXT NOT NULL CHECK(length(subject) BETWEEN 3 AND 150),
    description TEXT NOT NULL CHECK(length(description) BETWEEN 10 AND 2000),
    proof_path TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED')),
    resolution_note TEXT,
    resolved_by UUID REFERENCES bemo_private.app_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

ALTER TABLE public.bemo_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reporters can view their disputes" ON public.bemo_disputes
    FOR SELECT TO authenticated
    USING (reporter_id = auth.uid());

-- Function for submitting a dispute
CREATE OR REPLACE FUNCTION public.bemo_submit_dispute(
    p_order_id UUID,
    p_category TEXT,
    p_subject TEXT,
    p_description TEXT,
    p_proof_path TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bemo_private
AS $$
DECLARE
    v_user_id UUID;
    v_store_id UUID;
    v_dispute_id UUID;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    -- Lookup store associated with order
    SELECT store_id INTO v_store_id FROM bemo_private.orders WHERE id = p_order_id;

    INSERT INTO public.bemo_disputes (
        order_id,
        store_id,
        reporter_id,
        category,
        subject,
        description,
        proof_path,
        status
    ) VALUES (
        p_order_id,
        v_store_id,
        v_user_id,
        p_category,
        trim(p_subject),
        trim(p_description),
        p_proof_path,
        'OPEN'
    ) RETURNING id INTO v_dispute_id;

    RETURN jsonb_build_object('success', true, 'dispute_id', v_dispute_id);
END;
$$;

-- Function for listing disputes (buyer view or admin queue)
CREATE OR REPLACE FUNCTION public.bemo_list_disputes(
    p_view_as TEXT DEFAULT 'buyer'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bemo_private
AS $$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'AUTH_REQUIRED';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM bemo_private.user_roles WHERE user_id = v_user_id AND role = 'superadmin'
    ) INTO v_is_admin;

    IF p_view_as = 'admin' THEN
        IF NOT v_is_admin THEN
            RAISE EXCEPTION 'ADMIN_REQUIRED';
        END IF;

        RETURN (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', d.id,
                    'order_id', d.order_id,
                    'store_id', d.store_id,
                    'category', d.category,
                    'subject', d.subject,
                    'description', d.description,
                    'proof_path', d.proof_path,
                    'status', d.status,
                    'resolution_note', d.resolution_note,
                    'created_at', d.created_at,
                    'resolved_at', d.resolved_at
                ) ORDER BY d.created_at DESC
            ), '[]'::jsonb)
            FROM public.bemo_disputes d
        );
    ELSE
        RETURN (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'id', d.id,
                    'order_id', d.order_id,
                    'category', d.category,
                    'subject', d.subject,
                    'description', d.description,
                    'proof_path', d.proof_path,
                    'status', d.status,
                    'resolution_note', d.resolution_note,
                    'created_at', d.created_at
                ) ORDER BY d.created_at DESC
            ), '[]'::jsonb)
            FROM public.bemo_disputes d
            WHERE d.reporter_id = v_user_id
        );
    END IF;
END;
$$;

-- Function for admin resolving or rejecting a dispute
CREATE OR REPLACE FUNCTION public.bemo_resolve_dispute(
    p_dispute_id UUID,
    p_status TEXT,
    p_resolution_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, bemo_private
AS $$
DECLARE
    v_user_id UUID;
    v_is_admin BOOLEAN;
BEGIN
    v_user_id := auth.uid();
    SELECT EXISTS (
        SELECT 1 FROM bemo_private.user_roles WHERE user_id = v_user_id AND role = 'superadmin'
    ) INTO v_is_admin;

    IF NOT v_is_admin THEN
        RAISE EXCEPTION 'ADMIN_REQUIRED';
    END IF;

    IF p_status NOT IN ('RESOLVED', 'REJECTED', 'UNDER_REVIEW') THEN
        RAISE EXCEPTION 'INVALID_STATUS';
    END IF;

    UPDATE public.bemo_disputes
    SET status = p_status,
        resolution_note = trim(p_resolution_note),
        resolved_by = v_user_id,
        resolved_at = NOW()
    WHERE id = p_dispute_id;

    RETURN jsonb_build_object('success', true, 'dispute_id', p_dispute_id, 'status', p_status);
END;
$$;
