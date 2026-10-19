# frozen_string_literal: true

# Author: Preston Lee
class BooksController < ApplicationController
  def index
    @books = Book.includes(:bible)

    bible_uuid = params[:bible_uuid] || params[:bible_id]
    if bible_uuid.present?
      bible = Bible.find_by(id: bible_uuid)
      if bible
        @books = @books.where(bible_id: bible.id)
      end
    end

    @books = @books.merge(Book.ordered_with_bible)
  end

  def show
    if params[:bible_uuid].present?
      bible = Bible.find_by(id: params[:bible_uuid])
      if bible
        @book = bible.books.find_by!(id: params[:uuid])
      else
        head :not_found
        return
      end
    else
      @book = Book.find_by!(id: params[:uuid])
    end
  end
end
