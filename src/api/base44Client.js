import { supabase } from './supabaseClient';

const SESSION_KEY = 'frive_session';

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
    async list(sortField = '-created_date', limit = 500) {
      const { column, ascending } = parseSort(sortField);
      const { data, error } = await supabase.from(tableName).select('*').order(column, { ascending }).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async filter(filterObj = {}, sortField = '-created_date', limit = 500) {
      const { column, ascending } = parseSort(sortField);
      let query = supabase.from(tableName).select('*');
      for (const [key, value] of Object.entries(filterObj)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query.order(column, { ascending }).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async create(data) {
      const { data: result, error } = await supabase.from(tableName).insert(data).select().single();
      if (error) throw error;
      return result;
    },
    async update(id, data) {
      const { data: result, error } = await supabase.from(tableName).update(data).eq('id', id).select().single();
      if (error) throw error;
      return result;
    },
    async bulkCreate(rows) {
      const { data, error } = await supabase.from(tableName).insert(rows).select();
      if (error) throw error;
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(tableName).delete().eq('id', id);
      if (error) throw error;
      return true;
    },
  };
}

export const base44 = {
  entities: new Proxy({}, {
    get(_, entityName) {
      const tableName = TABLE_NAMES[entityName];
      return createEntityClient(tableName || entityName.toLowerCase() + 's');
    },
  }),
  auth: {
    me() {
      try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (new Date(session.expires_at) > new Date()) return session;
        localStorage.removeItem(SESSION_KEY);
      } catch { /* */ }
      return null;
    },
    logout() {
      localStorage.removeItem(SESSION_KEY);
      window.location.href = '/login';
    },
    redirectToLogin() {
      window.location.href = '/login';
    },
  },
};
