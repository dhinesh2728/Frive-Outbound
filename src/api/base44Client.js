import { supabase } from './supabaseClient';

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
    async me() {
      const stored = localStorage.getItem('frive_user');
      if (stored) return JSON.parse(stored);
      const defaultUser = { id: 'admin-1', email: 'admin@frive.co.uk', full_name: 'Frive Admin', role: 'admin' };
      localStorage.setItem('frive_user', JSON.stringify(defaultUser));
      return defaultUser;
    },
    logout() {
      localStorage.removeItem('frive_user');
      window.location.reload();
    },
    redirectToLogin() {},
  },
};
