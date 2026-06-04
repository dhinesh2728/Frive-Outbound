import { supabase } from './supabaseClient';

// Maps Base44 PascalCase entity names to Supabase snake_case table names
const TABLE_NAMES = {
  CookDateCombineRule: 'cook_date_combine_rules',
  CookDateOverride: 'cook_date_overrides',
  CookDateSettings: 'cook_date_settings',
  CrateSettings: 'crate_settings',
  ImportedMealPrediction: 'imported_meal_predictions',
  MealCountEntry: 'meal_count_entries',
  MealCountJob: 'meal_count_jobs',
  Pallet: 'pallets',
  Trailer: 'trailers',
};

function parseSort(sortField) {
  const ascending = !sortField.startsWith('-');
  const column = sortField.replace(/^-/, '');
  return { column, ascending };
}

function createEntityClient(tableName) {
  return {
    async list(sortField = '-created_date', limit = 100) {
      const { column, ascending } = parseSort(sortField);
      let query = supabase.from(tableName).select('*').order(column, { ascending });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async filter(filterObj = {}, sortField = '-created_date', limit = 100) {
      const { column, ascending } = parseSort(sortField);
      let query = supabase.from(tableName).select('*');
      for (const [key, value] of Object.entries(filterObj)) {
        query = query.eq(key, value);
      }
      query = query.order(column, { ascending });
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },

    async create(data) {
      const { data: result, error } = await supabase
        .from(tableName).insert(data).select().single();
      if (error) throw error;
      return result;
    },

    async update(id, data) {
      const { data: result, error } = await supabase
        .from(tableName).update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },

    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
  };
}

function mapUser(supabaseUser) {
  if (!supabaseUser) return null;
  return {
    id: supabaseUser.id,
    email: supabaseUser.email,
    full_name: supabaseUser.user_metadata?.full_name || supabaseUser.email,
    role: supabaseUser.user_metadata?.role || 'user',
    ...supabaseUser.user_metadata,
  };
}

export const base44 = {
  entities: new Proxy({}, {
    get(_, entityName) {
      const tableName = TABLE_NAMES[entityName];
      if (!tableName) {
        console.warn(`[base44] Unknown entity "${entityName}". Add it to TABLE_NAMES in base44Client.js`);
      }
      return createEntityClient(tableName || String(entityName).toLowerCase() + 's');
    },
  }),

  auth: {
    async me() {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) throw error || new Error('Not authenticated');
      return mapUser(user);
    },

    async logout(redirectUrl) {
      await supabase.auth.signOut();
      window.location.href = redirectUrl || '/login';
    },

    redirectToLogin(redirectUrl) {
      window.location.href = redirectUrl
        ? `/login?redirect=${encodeURIComponent(redirectUrl)}`
        : '/login';
    },
  },
};
