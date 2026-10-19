# frozen_string_literal: true

set :application, 'bibler'
set :repo_url, 'git@github.com:preston/bibler.git'

set :linked_files, %w[config/database.yml config/secrets.yml]
set :linked_dirs,
    fetch(:linked_dirs, []).push('bin', 'log', 'tmp/pids', 'tmp/cache', 'tmp/sockets', 'vendor/bundle', 'public/system')

# Default value for keep_releases is 5
set :keep_releases, 3

namespace :deploy do
  after :restart, :clear_cache do
    on roles(:web), in: :groups, limit: 3, wait: 10 do
      # Here we can do anything such as:
      # within release_path do
      #   execute :rake, 'cache:clear'
      # end
    end
  end

  after :finishing, 'deploy:cleanup'
end

# Hack from: https://gist.github.com/corny/7459729
# Overwrite the 'deploy:updating' task.
# Rake::Task["deploy:updating"].clear_actions
# namespace :deploy do

#   desc 'Copy repo to releases, along with submodules'
#   task updating: :'git:update' do
#     on roles(:all) do
#       with fetch(:git_environmental_variables) do
#         within repo_path do
#           # We'll be using 'git clone' instead of 'git archive' (what Capistrano uses), since the latter doesn't fetch submodules.
#           # Use --recursive to fetch submodules as well.
#           execute :git, :clone, '-b', fetch(:branch), '--recursive', '.', release_path
#           # Delete .git* files. We don't need them, and they can be a security threat.
#           execute "find #{release_path} \\( -name '.git' -o -name '.gitignore' -o -name '.gitmodules' \\) -exec rm -rf {} \\; > /dev/null 2>&1", raise_on_non_zero_exit: false
#         end
#       end
#     end
#   end

# end
