# frozen_string_literal: true

# Author: Preston Lee
# ActiveRecord rename_table also renames indexes to match the new table name.
class RenameUserFilesToDocuments < ActiveRecord::Migration[8.1]
  def change
    rename_table :user_files, :documents
  end
end
