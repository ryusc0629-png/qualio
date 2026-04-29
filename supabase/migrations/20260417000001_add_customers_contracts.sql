-- Phase 2: 고객 DB + 정기계약 테이블 추가

-- 1. 중앙 고객 테이블
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT,
  category TEXT,
  type TEXT NOT NULL DEFAULT 'one_time'
    CHECK (type IN ('recurring', 'one_time')),
  lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS 활성화
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customers_select" ON public.customers
  FOR SELECT USING (business_id = public.get_my_business_id());

CREATE POLICY "customers_insert" ON public.customers
  FOR INSERT WITH CHECK (business_id = public.get_my_business_id());

CREATE POLICY "customers_update" ON public.customers
  FOR UPDATE USING (business_id = public.get_my_business_id());

CREATE POLICY "customers_delete" ON public.customers
  FOR DELETE USING (business_id = public.get_my_business_id());

-- 인덱스
CREATE INDEX idx_customers_business_id ON public.customers(business_id);
CREATE INDEX idx_customers_type ON public.customers(business_id, type);

-- 2. 정기계약 테이블
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  frequency TEXT NOT NULL
    CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  contract_price INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'terminated')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at 자동 갱신 트리거
CREATE TRIGGER set_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS 활성화
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contracts_select" ON public.contracts
  FOR SELECT USING (business_id = public.get_my_business_id());

CREATE POLICY "contracts_insert" ON public.contracts
  FOR INSERT WITH CHECK (business_id = public.get_my_business_id());

CREATE POLICY "contracts_update" ON public.contracts
  FOR UPDATE USING (business_id = public.get_my_business_id());

CREATE POLICY "contracts_delete" ON public.contracts
  FOR DELETE USING (business_id = public.get_my_business_id());

-- 인덱스
CREATE INDEX idx_contracts_business_id ON public.contracts(business_id);
CREATE INDEX idx_contracts_customer_id ON public.contracts(customer_id);
CREATE INDEX idx_contracts_status ON public.contracts(business_id, status);

-- 3. bookings 테이블에 customer_id FK 추가 (nullable)
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
