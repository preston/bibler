json.array!(@testaments) do |t|
	json.extract! t, :id, :name, :slug, :created_at, :updated_at
end