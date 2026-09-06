-- A deployed legacy version used unqualified column names that collide with
-- the RETURNS TABLE output parameter `user_id`. Delivery completion invokes
-- this function through the loyalty trigger, so the ambiguity rolled back the
-- whole delivery transaction.

create or replace function public.award_loyalty_points(
  p_user_id uuid,
  p_points integer,
  p_reason text,
  p_order_id uuid default null
)
returns table(user_id uuid, new_balance integer, new_earned integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_balance integer;
  v_earned integer;
  v_redeemed integer;
  v_tier text;
  v_existing integer;
begin
  if p_points <= 0 then
    raise exception 'award_loyalty_points: points must be positive, got %', p_points
      using errcode = 'P0001';
  end if;

  if p_order_id is not null then
    select count(*) into v_existing
    from public.loyalty_transactions as lt
    where lt.user_id = p_user_id
      and lt.order_id = p_order_id
      and lt.reason = p_reason;

    if v_existing > 0 then
      select lp.balance, lp.total_earned into v_balance, v_earned
      from public.loyalty_points as lp
      where lp.user_id = p_user_id;
      if not found then
        v_balance := 0;
        v_earned := 0;
      end if;
      return query select p_user_id, v_balance, v_earned;
      return;
    end if;
  end if;

  select lp.balance, lp.total_earned, lp.total_redeemed, lp.tier
  into v_balance, v_earned, v_redeemed, v_tier
  from public.loyalty_points as lp
  where lp.user_id = p_user_id
  for update;

  if not found then
    insert into public.loyalty_points as lp
      (user_id, balance, total_earned, total_redeemed, tier)
    values (p_user_id, p_points, p_points, 0, 'bronze')
    on conflict on constraint loyalty_points_user_id_key do nothing
    returning lp.balance, lp.total_earned into v_balance, v_earned;

    if v_balance is null then
      select lp.balance, lp.total_earned into v_balance, v_earned
      from public.loyalty_points as lp
      where lp.user_id = p_user_id;
    end if;
  else
    v_balance := v_balance + p_points;
    v_earned := v_earned + p_points;
    update public.loyalty_points as lp
    set balance = v_balance,
        total_earned = v_earned,
        tier = case
          when v_earned >= 5000 then 'platinum'
          when v_earned >= 2000 then 'gold'
          when v_earned >= 500 then 'silver'
          else 'bronze'
        end,
        updated_at = now()
    where lp.user_id = p_user_id;
  end if;

  insert into public.loyalty_transactions
    (user_id, order_id, amount, reason, description)
  values (
    p_user_id,
    p_order_id,
    p_points,
    p_reason,
    'Awarded ' || p_points || ' points (' || p_reason || ')'
  );

  return query select p_user_id, v_balance, v_earned;
end;
$function$;

comment on function public.award_loyalty_points(uuid, integer, text, uuid) is
  'Atomically awards idempotent loyalty points without ambiguous PL/pgSQL output-column references.';
