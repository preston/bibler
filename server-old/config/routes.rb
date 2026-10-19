# frozen_string_literal: true

Rails.application.routes.draw do
  devise_for :users, skip: :registrations

  post '/session', to: 'sessions#create', defaults: { format: :json }
  get '/session', to: 'sessions#show', defaults: { format: :json }
  delete '/session', to: 'sessions#destroy', defaults: { format: :json }

  # Studies and AI routes must appear before generic verse routes.
  get '/ai/health', to: 'ai#health'
  post '/ai/chat', to: 'ai#chat'
  post '/ai/comparator_commentary', to: 'ai#comparator_commentary'

  resources :documents, path: 'documents', param: :uuid, only: %i[index create update destroy], defaults: { format: :json }

  resources :sermons, param: :uuid, only: %i[index show create update destroy], defaults: { format: :json } do
    resources :sections, controller: 'sermon_sections', param: :uuid, only: %i[index create update destroy], defaults: { format: :json } do
      resources :verses, controller: 'sermon_section_verses', param: :verse_uuid, only: %i[index create update destroy], defaults: { format: :json }
    end

    scope module: :sermons do
      post 'ai/verse_pass', to: 'ai#verse_pass'
      post 'ai/outline_pass', to: 'ai#outline_pass'
    end
  end

  resources :studies, param: :uuid, only: %i[index show create update destroy], defaults: { format: :json } do
    post :transfer_owner, on: :member
    get 'assignments', to: 'study_assignments#index'
    post 'assignments', to: 'study_assignments#create'
    delete 'assignments/:user_id', to: 'study_assignments#destroy'
    resource :role, controller: :study_roles, only: %i[show update], defaults: { format: :json }
    get '/modes', to: 'study_roles#show'
    match '/modes/mode', to: 'study_roles#update', via: %i[patch put post]
    resources :study_verses, path: :verses, param: :uuid, only: %i[index create update destroy], defaults: { format: :json }
    resources :study_commentaries, path: :commentaries, param: :uuid, only: %i[index show create update destroy], defaults: { format: :json }
    resources :study_questions, path: :questions, param: :uuid, only: %i[index show create update destroy], defaults: { format: :json } do
      post :reorder, on: :collection
      resources :study_answers, path: :answers, param: :uuid, only: %i[index create update destroy], defaults: { format: :json }
    end
    resources :study_tasks, path: :tasks, param: :uuid, only: %i[index show create update destroy], defaults: { format: :json } do
      post :reorder, on: :collection
    end
    resources :study_plan_items, path: :plan_items, param: :uuid, only: %i[index create update destroy], defaults: { format: :json } do
      post :reorder, on: :collection
      patch :state, on: :member, action: :update_state
    end

    scope module: :studies do
      post '/ai/generate_commentary', to: 'ai#generate_commentary'
      post '/ai/summarize', to: 'ai#summarize'
      post '/ai/generate_questions', to: 'ai#generate_questions'
      post '/ai/assistant', to: 'ai#assistant'
    end
  end

  resources :books, param: :uuid, only: %i[index show]
  resources :bibles, param: :uuid, only: %i[index show] do
    resources :books, param: :uuid, only: %i[index show], controller: 'books'
  end
  namespace :system do
    resources :roles, only: %i[index show create update destroy], defaults: { format: :json }
    resources :users, only: %i[index show create update], defaults: { format: :json }
    get '/settings/ai_defaults', to: 'settings#ai_defaults'
    patch '/settings/ai_defaults', to: 'settings#update_ai_defaults'
  end
  get ':bible/:book/:chapter/:ordinal' => 'verses#show', as: :verse_lookup
  get ':bible/:book' => 'verses#chapters', as: :bible_book_chapters
  get ':bible/:book/:chapter' => 'verses#verses', as: :bible_book_chapter_verses
  post ':bible/search' => 'verses#search', as: :bible_search

  # MCP (Model Context Protocol) endpoints
  # POST for JSON-RPC command channel (regular JSON responses)
  # GET for SSE announcement channel (streaming)
  post 'mcp', to: 'mcp#handle'
  get 'mcp', to: 'mcp_stream#stream'
end
