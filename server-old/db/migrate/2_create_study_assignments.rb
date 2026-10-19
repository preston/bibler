# frozen_string_literal: true

class CreateStudyAssignments < ActiveRecord::Migration[8.1]
  def change
    create_table :study_assignments, id: :uuid do |t|
      t.references :study, null: false, foreign_key: true, type: :uuid
      t.references :user, null: false, foreign_key: true, type: :uuid
      t.timestamps
    end
    add_index :study_assignments, %i[study_id user_id], unique: true
  end
end
